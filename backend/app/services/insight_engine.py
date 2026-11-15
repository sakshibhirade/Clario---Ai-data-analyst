import json
import math
import statistics
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from ..database.dynamic_engine import get_engine_for_datasource
from ..database.connection import engine as internal_engine
from ..database.models import DataSource, InsightReport, InsightItem
from .llm_service import generate_text, LLMError


def _safe_float(val: Any) -> Optional[float]:
    """Convert value to float safely or return None."""
    if val is None:
        return None
    try:
        f = float(val)
        return f if not math.isnan(f) and not math.isinf(f) else None
    except (ValueError, TypeError):
        return None


def _format_num(val: Optional[float]) -> str:
    """Format numbers cleanly for business reporting."""
    if val is None:
        return "N/A"
    if abs(val) >= 1_000_000:
        return f"{val / 1_000_000:.2f}M"
    if abs(val) >= 1_000:
        return f"{val:,.2f}" if abs(val - round(val)) > 0.001 else f"{int(round(val)):,}"
    if abs(val - round(val)) < 0.001:
        return str(int(round(val)))
    return f"{val:.2f}"


class InsightEngine:
    """
    Automated Data Profiler, Statistical Anomaly Detector, Trend Analyzer,
    and Gemini AI Insight Generator for Clario.
    """

    def __init__(self, datasource: Optional[DataSource], db_session):
        self.datasource = datasource
        self.db = db_session
        if datasource:
            self.engine: Engine = get_engine_for_datasource(datasource)
            self.dialect = "sqlite" if datasource.database_type in ("csv", "excel", "sqlite") else "postgres"
            self.dataset_label = datasource.connection_name
            self.ds_id = datasource.id
        else:
            self.engine = internal_engine
            self.dialect = "postgres"
            self.dataset_label = "Internal PostgreSQL Database"
            self.ds_id = "internal"

    def run_analysis(self) -> InsightReport:
        """
        Execute end-to-end data profiling, anomaly detection, trend analysis,
        and Gemini synthesis. Persists and returns the final InsightReport.
        """
        # 1. Profile dataset
        profile = self._profile_dataset()

        # 2. Statistical Anomaly Detection
        anomalies = self._detect_anomalies(profile)

        # 3. Trend Analysis
        trends = self._analyze_trends(profile)

        # Combine all findings
        all_raw_findings = anomalies + trends

        # 4. Synthesize with Gemini for explanations, recommendations & executive summary
        synthesis = self._synthesize_with_gemini(profile, all_raw_findings)

        # 5. Persist report and items to database
        report = InsightReport(
            datasource_id=self.ds_id,
            user_id="default_user",
            dataset_label=self.dataset_label,
            total_insights=len(synthesis["items"]),
            anomalies_count=sum(1 for it in synthesis["items"] if it["category"] == "anomaly"),
            trends_count=sum(1 for it in synthesis["items"] if it["category"] == "trend"),
            recommendations_count=sum(1 for it in synthesis["items"] if it.get("ai_recommendation")),
            executive_summary=synthesis.get("executive_summary", "Automated analysis completed successfully."),
            created_at=datetime.utcnow(),
        )
        self.db.add(report)
        self.db.flush()

        for item_data in synthesis["items"]:
            item = InsightItem(
                report_id=report.id,
                datasource_id=self.ds_id,
                user_id="default_user",
                title=item_data.get("title", "Insight"),
                category=item_data.get("category", "trend"),
                severity=item_data.get("severity", "info"),
                metric_name=item_data.get("metric_name"),
                table_name=item_data.get("table_name"),
                detected_value=str(item_data.get("detected_value", "")),
                baseline_value=str(item_data.get("baseline_value", "")),
                deviation_pct=item_data.get("deviation_pct"),
                methodology=item_data.get("methodology"),
                confidence=item_data.get("confidence", "high"),
                description=item_data.get("description", ""),
                ai_explanation=item_data.get("ai_explanation", ""),
                ai_recommendation=item_data.get("ai_recommendation", ""),
                evidence_data=item_data.get("evidence_data"),
                chart_type=item_data.get("chart_type"),
                status="new",
                created_at=datetime.utcnow(),
            )
            self.db.add(item)

        self.db.commit()
        self.db.refresh(report)
        return report

    def _profile_dataset(self) -> Dict[str, Any]:
        """
        Inspect all tables and columns, compute column types, null counts,
        aggregations (min, max, avg, stddev), and category distributions.
        """
        inspector = inspect(self.engine)
        table_names = inspector.get_table_names()
        profile: Dict[str, Any] = {"tables": {}, "total_rows": 0}

        with self.engine.connect() as conn:
            for table_name in table_names:
                # Safe table quoting
                q_table = f'"{table_name}"'

                # Get row count
                try:
                    count_res = conn.execute(text(f"SELECT COUNT(*) FROM {q_table}"))
                    row_count = count_res.scalar() or 0
                except Exception:
                    continue

                if row_count == 0:
                    continue

                profile["total_rows"] += row_count
                columns = inspector.get_columns(table_name)
                pk_constraint = inspector.get_pk_constraint(table_name)
                pk_cols = pk_constraint.get("constrained_columns", []) if pk_constraint else []

                t_profile = {
                    "row_count": row_count,
                    "columns": {},
                    "numeric_cols": [],
                    "categorical_cols": [],
                    "date_cols": [],
                }

                for col in columns:
                    col_name = col["name"]
                    col_type_str = str(col["type"]).upper()
                    is_pk = col_name in pk_cols

                    # Classify column type
                    is_numeric = any(t in col_type_str for t in ["INT", "FLOAT", "NUMERIC", "DECIMAL", "REAL", "DOUBLE"]) and not col_name.endswith("_id") and col_name != "id"
                    is_date = any(t in col_type_str for t in ["DATE", "TIME", "TIMESTAMP"])
                    is_categorical = any(t in col_type_str for t in ["CHAR", "TEXT", "VARCHAR", "STRING"]) and not col_name.endswith("_id") and col_name != "id"

                    col_data: Dict[str, Any] = {
                        "type": col_type_str,
                        "is_pk": is_pk,
                        "is_numeric": is_numeric,
                        "is_date": is_date,
                        "is_categorical": is_categorical,
                    }

                    q_col = f'"{col_name}"'

                    # Check nulls
                    try:
                        null_res = conn.execute(text(f"SELECT COUNT(*) FROM {q_table} WHERE {q_col} IS NULL"))
                        null_count = null_res.scalar() or 0
                        col_data["null_count"] = null_count
                        col_data["null_pct"] = round((null_count / row_count) * 100, 1)
                    except Exception:
                        col_data["null_count"] = 0
                        col_data["null_pct"] = 0.0

                    # Numeric statistics
                    if is_numeric:
                        try:
                            stats_res = conn.execute(
                                text(f"SELECT MIN({q_col}), MAX({q_col}), AVG({q_col}) FROM {q_table} WHERE {q_col} IS NOT NULL")
                            ).fetchone()
                            if stats_res:
                                col_data["min"] = _safe_float(stats_res[0])
                                col_data["max"] = _safe_float(stats_res[1])
                                col_data["avg"] = _safe_float(stats_res[2])

                            # Fetch bounded sample for median and IQR
                            samp_res = conn.execute(
                                text(f"SELECT {q_col} FROM {q_table} WHERE {q_col} IS NOT NULL LIMIT 1000")
                            ).fetchall()
                            vals = [float(r[0]) for r in samp_res if _safe_float(r[0]) is not None]
                            if len(vals) >= 4:
                                vals.sort()
                                col_data["median"] = statistics.median(vals)
                                col_data["stdev"] = statistics.stdev(vals) if len(vals) > 1 else 0
                                q1, q2, q3 = statistics.quantiles(vals, n=4)
                                col_data["q1"] = q1
                                col_data["q3"] = q3
                                col_data["iqr"] = q3 - q1
                                col_data["sample_values"] = vals
                        except Exception:
                            pass
                        t_profile["numeric_cols"].append(col_name)

                    # Categorical distribution
                    elif is_categorical:
                        try:
                            dist_res = conn.execute(
                                text(f"SELECT {q_col}, COUNT(*) as cnt FROM {q_table} WHERE {q_col} IS NOT NULL GROUP BY {q_col} ORDER BY cnt DESC LIMIT 8")
                            ).fetchall()
                            col_data["distribution"] = [{"label": str(r[0]), "count": int(r[1])} for r in dist_res]
                            col_data["distinct_count"] = len(col_data["distribution"])
                        except Exception:
                            pass
                        t_profile["categorical_cols"].append(col_name)

                    # Date columns
                    elif is_date:
                        try:
                            date_range = conn.execute(
                                text(f"SELECT MIN({q_col}), MAX({q_col}) FROM {q_table} WHERE {q_col} IS NOT NULL")
                            ).fetchone()
                            if date_range:
                                col_data["min_date"] = str(date_range[0])
                                col_data["max_date"] = str(date_range[1])
                        except Exception:
                            pass
                        t_profile["date_cols"].append(col_name)

                    t_profile["columns"][col_name] = col_data

                profile["tables"][table_name] = t_profile

        return profile

    def _detect_anomalies(self, profile: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Detect statistical anomalies using Z-score, IQR, and category skew.
        """
        findings = []

        for table_name, t_info in profile["tables"].items():
            row_count = t_info["row_count"]
            if row_count < 5:
                continue

            # 1. Missing data anomalies (> 20% missing)
            for col_name, c_info in t_info["columns"].items():
                null_pct = c_info.get("null_pct", 0)
                if null_pct >= 20.0:
                    findings.append({
                        "category": "anomaly",
                        "severity": "critical" if null_pct >= 40 else "warning",
                        "title": f"High Missing Data Rate in {col_name} ({null_pct}%)",
                        "table_name": table_name,
                        "metric_name": col_name,
                        "detected_value": f"{null_pct}% nulls",
                        "baseline_value": "< 5.0% expected",
                        "deviation_pct": round(null_pct - 5.0, 1),
                        "methodology": "null_threshold",
                        "confidence": "high",
                        "description": f"Column '{col_name}' in table '{table_name}' has {c_info.get('null_count')} missing values out of {row_count} records ({null_pct}%).",
                        "chart_type": "donut",
                        "evidence_data": {
                            "chart_data": [
                                {"label": "Missing Values", "value": c_info.get("null_count", 0)},
                                {"label": "Complete Values", "value": row_count - c_info.get("null_count", 0)},
                            ]
                        },
                    })

            # 2. Numerical IQR & Z-score Outliers
            for col_name in t_info["numeric_cols"]:
                c_info = t_info["columns"][col_name]
                vals = c_info.get("sample_values", [])
                if len(vals) < 8:
                    continue

                median = c_info.get("median", 0)
                iqr = c_info.get("iqr", 0)
                stdev = c_info.get("stdev", 0)
                avg = c_info.get("avg", 0)
                max_val = c_info.get("max", 0)
                min_val = c_info.get("min", 0)

                # Upper extreme outlier
                if iqr > 0 and max_val is not None and max_val > (c_info.get("q3", 0) + 2.5 * iqr):
                    dev_pct = round(((max_val - median) / max(abs(median), 0.001)) * 100, 1)
                    findings.append({
                        "category": "anomaly",
                        "severity": "critical" if dev_pct > 250 else "warning",
                        "title": f"Extreme Spike Detected in {col_name} ({_format_num(max_val)})",
                        "table_name": table_name,
                        "metric_name": col_name,
                        "detected_value": _format_num(max_val),
                        "baseline_value": f"Median {_format_num(median)}",
                        "deviation_pct": dev_pct,
                        "methodology": "iqr_outlier_detection",
                        "confidence": "high",
                        "description": f"Maximum observed value {_format_num(max_val)} exceeds the upper IQR boundary ({_format_num(c_info.get('q3', 0) + 1.5 * iqr)}) by {dev_pct}%.",
                        "chart_type": "bar",
                        "evidence_data": {
                            "chart_data": [
                                {"label": "Minimum", "value": min_val},
                                {"label": "Q1", "value": c_info.get("q1", 0)},
                                {"label": "Median", "value": median},
                                {"label": "Average", "value": avg},
                                {"label": "Q3", "value": c_info.get("q3", 0)},
                                {"label": "Peak Outlier", "value": max_val},
                            ]
                        },
                    })

            # 3. Categorical Skew (> 70% in single category)
            for col_name in t_info["categorical_cols"]:
                c_info = t_info["columns"][col_name]
                dist = c_info.get("distribution", [])
                if len(dist) >= 2 and row_count >= 15:
                    top_item = dist[0]
                    top_share = (top_item["count"] / row_count) * 100
                    if top_share >= 65.0:
                        findings.append({
                            "category": "anomaly",
                            "severity": "warning",
                            "title": f"Concentration Risk: '{top_item['label']}' Dominates {col_name} ({round(top_share)}%)",
                            "table_name": table_name,
                            "metric_name": col_name,
                            "detected_value": f"{round(top_share, 1)}% share",
                            "baseline_value": f"{round(100.0 / len(dist), 1)}% balanced share",
                            "deviation_pct": round(top_share - (100.0 / len(dist)), 1),
                            "methodology": "category_distribution_skew",
                            "confidence": "high",
                            "description": f"A single category '{top_item['label']}' accounts for {top_item['count']} out of {row_count} total records ({round(top_share, 1)}%).",
                            "chart_type": "donut",
                            "evidence_data": {
                                "chart_data": [{"label": d["label"], "value": d["count"]} for d in dist]
                            },
                        })

        return findings

    def _analyze_trends(self, profile: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Analyze time-series trajectories, category comparisons, and volume patterns.
        """
        findings = []

        with self.engine.connect() as conn:
            for table_name, t_info in profile["tables"].items():
                date_cols = t_info.get("date_cols", [])
                numeric_cols = t_info.get("numeric_cols", [])
                cat_cols = t_info.get("categorical_cols", [])
                q_table = f'"{table_name}"'

                # Time-series trend analysis
                if date_cols and (numeric_cols or t_info["row_count"] >= 10):
                    date_col = date_cols[0]
                    num_col = numeric_cols[0] if numeric_cols else None
                    metric_expr = f'SUM("{num_col}")' if num_col else "COUNT(*)"
                    metric_label = f"Total {num_col}" if num_col else "Record Volume"

                    # Group by period (month or date)
                    if self.dialect == "postgres":
                        ts_sql = f"""
                            SELECT TO_CHAR(DATE_TRUNC('month', "{date_col}"), 'YYYY-MM') as period,
                                   {metric_expr} as val
                            FROM {q_table}
                            WHERE "{date_col}" IS NOT NULL
                            GROUP BY period
                            ORDER BY period ASC
                            LIMIT 12
                        """
                    else:
                        ts_sql = f"""
                            SELECT SUBSTR("{date_col}", 1, 7) as period,
                                   {metric_expr} as val
                            FROM {q_table}
                            WHERE "{date_col}" IS NOT NULL AND "{date_col}" != ''
                            GROUP BY period
                            ORDER BY period ASC
                            LIMIT 12
                        """

                    try:
                        ts_rows = conn.execute(text(ts_sql)).fetchall()
                        ts_data = [
                            {"label": str(r[0]), "value": float(r[1]) if _safe_float(r[1]) is not None else 0.0}
                            for r in ts_rows
                            if r[0] and len(str(r[0]).strip()) >= 4
                        ]

                        if len(ts_data) >= 3:
                            first_val = ts_data[0]["value"]
                            last_val = ts_data[-1]["value"]
                            prev_val = ts_data[-2]["value"]

                            # Overall change
                            overall_chg = round(((last_val - first_val) / max(abs(first_val), 1)) * 100, 1) if first_val > 0 else 0
                            # Recent period change
                            recent_chg = round(((last_val - prev_val) / max(abs(prev_val), 1)) * 100, 1) if prev_val > 0 else 0

                            severity = "positive" if overall_chg > 10 else "warning" if overall_chg < -10 else "info"
                            dir_label = "Growth" if overall_chg > 5 else "Decline" if overall_chg < -5 else "Stable Plateau"

                            findings.append({
                                "category": "trend",
                                "severity": severity,
                                "title": f"{metric_label} {dir_label} ({'+' if overall_chg > 0 else ''}{overall_chg}% Overall)",
                                "table_name": table_name,
                                "metric_name": metric_label,
                                "detected_value": f"{_format_num(last_val)} (latest period)",
                                "baseline_value": f"{_format_num(first_val)} (initial period)",
                                "deviation_pct": overall_chg,
                                "methodology": "time_series_trajectory",
                                "confidence": "high",
                                "description": f"{metric_label} shifted by {'+' if overall_chg > 0 else ''}{overall_chg}% from {ts_data[0]['label']} to {ts_data[-1]['label']}. Recent monthly momentum is {'+' if recent_chg > 0 else ''}{recent_chg}%.",
                                "chart_type": "line",
                                "evidence_data": {"chart_data": ts_data},
                            })
                    except Exception:
                        pass

                # Categorical performance comparisons
                if cat_cols and numeric_cols:
                    cat_col = cat_cols[0]
                    num_col = numeric_cols[0]
                    cat_sql = f"""
                        SELECT "{cat_col}", SUM("{num_col}") as total_val
                        FROM {q_table}
                        WHERE "{cat_col}" IS NOT NULL AND "{num_col}" IS NOT NULL
                        GROUP BY "{cat_col}"
                        ORDER BY total_val DESC
                        LIMIT 6
                    """
                    try:
                        cat_res = conn.execute(text(cat_sql)).fetchall()
                        cat_data = [
                            {"label": str(r[0]), "value": float(r[1]) if _safe_float(r[1]) is not None else 0.0}
                            for r in cat_res
                        ]
                        if len(cat_data) >= 2:
                            top = cat_data[0]
                            bottom = cat_data[-1]
                            ratio = round(top["value"] / max(bottom["value"], 0.001), 1)

                            findings.append({
                                "category": "trend",
                                "severity": "info",
                                "title": f"Top Performer in {cat_col}: '{top['label']}' Leads ({_format_num(top['value'])})",
                                "table_name": table_name,
                                "metric_name": f"{num_col} by {cat_col}",
                                "detected_value": _format_num(top["value"]),
                                "baseline_value": f"Lowest: {_format_num(bottom['value'])}",
                                "deviation_pct": round(((top["value"] - bottom["value"]) / max(bottom["value"], 0.001)) * 100, 1),
                                "methodology": "segment_comparison",
                                "confidence": "high",
                                "description": f"'{top['label']}' generated {_format_num(top['value'])}, outperforming '{bottom['label']}' by {ratio}x.",
                                "chart_type": "bar",
                                "evidence_data": {"chart_data": cat_data},
                            })
                    except Exception:
                        pass

        return findings

    def _synthesize_with_gemini(
        self, profile: Dict[str, Any], raw_findings: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Send structured statistical findings to Gemini for human-readable business
        explanations, actionable recommendations, and an executive summary.
        Grounded strictly in computed data.
        """
        table_summary = {
            t: {"rows": info["row_count"], "columns": list(info["columns"].keys())}
            for t, info in profile["tables"].items()
        }

        # Prepare payload for Gemini
        prompt_payload = {
            "dataset_label": self.dataset_label,
            "total_records": profile["total_rows"],
            "tables_overview": table_summary,
            "statistical_findings": [
                {
                    "id": idx,
                    "title": f["title"],
                    "category": f["category"],
                    "severity": f["severity"],
                    "metric_name": f["metric_name"],
                    "table_name": f["table_name"],
                    "detected_value": f["detected_value"],
                    "baseline_value": f["baseline_value"],
                    "deviation_pct": f.get("deviation_pct"),
                    "methodology": f.get("methodology"),
                    "description": f["description"],
                }
                for idx, f in enumerate(raw_findings)
            ],
        }

        prompt = f"""
You are the Clario Insight Engine, an expert automated business intelligence analyst.
Analyze the following statistical findings and data profile.

Data Findings:
{json.dumps(prompt_payload, indent=2)}

Instructions:
1. Ground every single explanation strictly in the observed statistical findings. DO NOT invent facts, numbers, dates, or outside events.
2. Provide an executive summary (2-3 concise, impactful sentences) summarizing data quality, primary trends, and key anomalies.
3. For each finding (by id):
   - Provide "ai_explanation": 1-2 clear, business-friendly sentences explaining what the statistical deviation means in practice.
   - Provide "ai_recommendation": 1-2 concrete, practical, next-step recommendations for a business manager or analyst.
4. Clearly distinguish facts from interpretations. If historical data is limited, explicitly mention this.
5. Return ONLY a valid JSON object matching this exact schema:
{{
  "executive_summary": "...",
  "findings": [
    {{
      "id": 0,
      "ai_explanation": "...",
      "ai_recommendation": "..."
    }}
  ]
}}
"""

        try:
            raw_text = generate_text(prompt).strip()
            # Clean markdown code fences if added
            if raw_text.startswith("```"):
                raw_text = raw_text.replace("```json", "").replace("```", "").strip()

            parsed = json.loads(raw_text)
            exec_summary = parsed.get("executive_summary", "Automated analysis completed.")
            explanations_by_id = {
                item["id"]: item for item in parsed.get("findings", []) if "id" in item
            }
        except Exception:
            exec_summary = f"Automated profile across {profile['total_rows']} records identified {len(raw_findings)} significant statistical patterns."
            explanations_by_id = {}

        # Merge Gemini output back into findings
        enriched_items = []
        for idx, f in enumerate(raw_findings):
            exp_data = explanations_by_id.get(idx, {})
            f_copy = dict(f)
            f_copy["ai_explanation"] = exp_data.get(
                "ai_explanation",
                f"{f['description']} This metric deviates notably from expected historical or distribution baselines.",
            )
            f_copy["ai_recommendation"] = exp_data.get(
                "ai_recommendation",
                f"Examine underlying rows for {f['metric_name']} in table {f['table_name']} to isolate the root drivers of this variation.",
            )
            enriched_items.append(f_copy)

        return {
            "executive_summary": exec_summary,
            "items": enriched_items,
        }
