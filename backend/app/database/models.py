import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, JSON, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class DataSource(Base):
    __tablename__ = "data_sources"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(100), nullable=False, default="default_user", index=True)
    connection_name = Column(String(200), nullable=False)
    database_type = Column(String(50), nullable=False)  # "postgresql", "csv", "excel"
    host = Column(String(255), nullable=True)
    port = Column(Integer, nullable=True)
    database_name = Column(String(255), nullable=True)
    username = Column(String(255), nullable=True)
    encrypted_credentials = Column(Text, nullable=True)
    file_path = Column(String(500), nullable=True)
    connection_status = Column(String(50), default="connected")  # "connected", "error", "disconnected"
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "connection_name": self.connection_name,
            "database_type": self.database_type,
            "host": self.host,
            "port": self.port,
            "database_name": self.database_name,
            "username": self.username,
            "connection_status": self.connection_status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class InsightReport(Base):
    __tablename__ = "insight_reports"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    datasource_id = Column(String(100), nullable=False, default="internal", index=True)
    user_id = Column(String(100), nullable=False, default="default_user", index=True)
    dataset_label = Column(String(255), nullable=False)
    total_insights = Column(Integer, default=0)
    anomalies_count = Column(Integer, default=0)
    trends_count = Column(Integer, default=0)
    recommendations_count = Column(Integer, default=0)
    executive_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    items = relationship("InsightItem", back_populates="report", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "datasource_id": self.datasource_id,
            "user_id": self.user_id,
            "dataset_label": self.dataset_label,
            "total_insights": self.total_insights,
            "anomalies_count": self.anomalies_count,
            "trends_count": self.trends_count,
            "recommendations_count": self.recommendations_count,
            "executive_summary": self.executive_summary,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class InsightItem(Base):
    __tablename__ = "insight_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    report_id = Column(String(36), ForeignKey("insight_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    datasource_id = Column(String(100), nullable=False, default="internal", index=True)
    user_id = Column(String(100), nullable=False, default="default_user", index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(50), nullable=False)  # "anomaly", "trend", "recommendation"
    severity = Column(String(50), nullable=False, default="info")  # "critical", "warning", "positive", "info"
    metric_name = Column(String(150), nullable=True)
    table_name = Column(String(150), nullable=True)
    detected_value = Column(String(100), nullable=True)
    baseline_value = Column(String(100), nullable=True)
    deviation_pct = Column(Float, nullable=True)
    methodology = Column(String(100), nullable=True)  # "z_score", "iqr", "percentage_change", "category_distribution", "correlation"
    confidence = Column(String(50), default="high")  # "high", "medium", "low"
    description = Column(Text, nullable=False)
    ai_explanation = Column(Text, nullable=True)
    ai_recommendation = Column(Text, nullable=True)
    evidence_data = Column(JSON, nullable=True)  # chart points, statistics, samples
    chart_type = Column(String(50), nullable=True)  # "line", "bar", "area", "donut"
    status = Column(String(50), default="new")  # "new", "reviewed", "saved", "dismissed"
    created_at = Column(DateTime, default=datetime.utcnow)

    report = relationship("InsightReport", back_populates="items")

    def to_dict(self):
        return {
            "id": self.id,
            "report_id": self.report_id,
            "datasource_id": self.datasource_id,
            "user_id": self.user_id,
            "title": self.title,
            "category": self.category,
            "severity": self.severity,
            "metric_name": self.metric_name,
            "table_name": self.table_name,
            "detected_value": self.detected_value,
            "baseline_value": self.baseline_value,
            "deviation_pct": self.deviation_pct,
            "methodology": self.methodology,
            "confidence": self.confidence,
            "description": self.description,
            "ai_explanation": self.ai_explanation,
            "ai_recommendation": self.ai_recommendation,
            "evidence_data": self.evidence_data,
            "chart_type": self.chart_type,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ClarioUser(Base):
    __tablename__ = "clario_users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    full_name = Column(String(200), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    avatar_initials = Column(String(10), nullable=True)
    preferences = Column(JSON, nullable=True, default=dict)
    reset_token = Column(String(255), nullable=True, index=True)
    reset_token_expires = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "full_name": self.full_name,
            "email": self.email,
            "avatar_initials": self.avatar_initials or (self.full_name[:2].upper() if self.full_name else "CL"),
            "preferences": self.preferences or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

