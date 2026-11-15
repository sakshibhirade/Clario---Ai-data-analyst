from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...database.connection import get_db
from ...database.models import DataSource, InsightReport, InsightItem
from ...services.insight_engine import InsightEngine
from ...database.dynamic_engine import preview_table_data

router = APIRouter()

DEFAULT_USER_ID = "default_user"


class AnalyzeRequest(BaseModel):
    datasource_id: Optional[str] = Field(None, description="Optional ID of connected DataSource, or null for default DB")


class StatusUpdateRequest(BaseModel):
    status: str = Field(..., pattern="^(new|reviewed|saved|dismissed)$")


@router.post("/analyze")
def trigger_analysis(
    request: AnalyzeRequest,
    db: Session = Depends(get_db),
):
    """
    Trigger automatic data profiling, statistical anomaly detection,
    trend analysis, and Gemini AI synthesis for the selected data source.
    """
    datasource: Optional[DataSource] = None
    if request.datasource_id and request.datasource_id != "internal":
        datasource = db.query(DataSource).filter(
            DataSource.id == request.datasource_id,
            DataSource.user_id == DEFAULT_USER_ID,
        ).first()

        if not datasource:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Data source with ID '{request.datasource_id}' was not found.",
            )

    try:
        engine = InsightEngine(datasource=datasource, db_session=db)
        report = engine.run_analysis()
        items = db.query(InsightItem).filter(InsightItem.report_id == report.id).all()

        return {
            "status": "success",
            "message": f"Successfully analyzed {report.dataset_label}. Discovered {report.total_insights} insights.",
            "report": report.to_dict(),
            "items": [it.to_dict() for it in items],
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Insight analysis failed: {str(e)}",
        )


@router.get("")
def get_insights(
    datasource_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    item_status: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    """
    Retrieve the latest insight report and its items for the active data source.
    """
    target_ds_id = datasource_id or "internal"

    # Find the most recent report for this datasource
    latest_report = (
        db.query(InsightReport)
        .filter(
            InsightReport.datasource_id == target_ds_id,
            InsightReport.user_id == DEFAULT_USER_ID,
        )
        .order_by(InsightReport.created_at.desc())
        .first()
    )

    if not latest_report:
        return {
            "has_report": False,
            "report": None,
            "items": [],
        }

    # Query items for this report with optional filters
    query = db.query(InsightItem).filter(InsightItem.report_id == latest_report.id)
    if category:
        query = query.filter(InsightItem.category == category)
    if item_status:
        query = query.filter(InsightItem.status == item_status)

    items = query.order_by(InsightItem.created_at.desc()).all()

    return {
        "has_report": True,
        "report": latest_report.to_dict(),
        "items": [it.to_dict() for it in items],
    }


@router.get("/{id}")
def get_insight_detail(
    id: str,
    db: Session = Depends(get_db),
):
    """
    Retrieve details for a single insight item, including underlying sample records.
    """
    item = db.query(InsightItem).filter(
        InsightItem.id == id,
        InsightItem.user_id == DEFAULT_USER_ID,
    ).first()

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insight item not found.",
        )

    # Fetch sample records from the associated table if available
    sample_records = []
    if item.table_name and item.datasource_id != "internal":
        ds = db.query(DataSource).filter(DataSource.id == item.datasource_id).first()
        if ds:
            try:
                prev = preview_table_data(ds, item.table_name, limit=10)
                sample_records = prev.get("rows", [])
            except Exception:
                pass

    return {
        "status": "success",
        "insight": item.to_dict(),
        "sample_records": sample_records,
    }


@router.post("/{id}/ask")
def prepare_ask_ai_query(
    id: str,
    db: Session = Depends(get_db),
):
    """
    Generate contextual questions and prompt information for the AI chat agent
    based on a selected insight.
    """
    item = db.query(InsightItem).filter(
        InsightItem.id == id,
        InsightItem.user_id == DEFAULT_USER_ID,
    ).first()

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insight item not found.",
        )

    question = f"Why did {item.metric_name or item.title} show a deviation in table {item.table_name or 'the database'}?"
    if item.category == "anomaly":
        suggested_queries = [
            f"What factors contributed to {item.metric_name} reaching {item.detected_value}?",
            f"Show me the records from {item.table_name} with the highest {item.metric_name}",
            f"Compare {item.metric_name} values against the historical baseline",
        ]
    else:
        suggested_queries = [
            f"Break down {item.metric_name} by key categories",
            f"Show monthly trend for {item.metric_name} over time",
            f"Which segments or products contributed most to this trend?",
        ]

    return {
        "status": "success",
        "datasource_id": item.datasource_id,
        "default_question": question,
        "suggested_queries": suggested_queries,
        "insight_context": {
            "title": item.title,
            "metric": item.metric_name,
            "detected_value": item.detected_value,
            "baseline": item.baseline_value,
            "table": item.table_name,
            "ai_explanation": item.ai_explanation,
            "ai_recommendation": item.ai_recommendation,
        },
    }


@router.patch("/{id}/status")
def update_insight_status(
    id: str,
    body: StatusUpdateRequest,
    db: Session = Depends(get_db),
):
    """
    Update the user status of an insight (reviewed, saved, dismissed).
    """
    item = db.query(InsightItem).filter(
        InsightItem.id == id,
        InsightItem.user_id == DEFAULT_USER_ID,
    ).first()

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insight item not found.",
        )

    item.status = body.status
    db.commit()
    db.refresh(item)

    return {
        "status": "success",
        "id": item.id,
        "new_status": item.status,
    }
