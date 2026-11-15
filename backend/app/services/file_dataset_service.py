import csv
import io
import os
import re
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple
from fastapi import UploadFile

# Directory for storing user uploaded dataset databases
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "data_uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25MB max file size


def sanitize_identifier(name: str, fallback_prefix: str = "col") -> str:
    """Sanitize column or table names to safe, clean SQL identifiers."""
    name = str(name).strip()
    # Replace non-alphanumeric with underscores
    clean = re.sub(r"[^\w]+", "_", name).strip("_").lower()
    if not clean or clean[0].isdigit():
        clean = f"{fallback_prefix}_{clean}"
    return clean


def infer_sqlite_type(sample_values: List[str]) -> str:
    """Infer SQLite column type from a list of non-empty sample string values."""
    if not sample_values:
        return "TEXT"

    is_int = True
    is_float = True
    is_date = True

    for val in sample_values:
        val_str = str(val).strip()
        if not val_str:
            continue

        # Check int
        if is_int:
            try:
                int(val_str)
            except ValueError:
                is_int = False

        # Check float
        if is_float:
            try:
                float(val_str.replace(",", ""))
            except ValueError:
                is_float = False

        # Check date
        if is_date:
            try:
                # Common formats: 2026-11-04, 04/11/2026, etc.
                if len(val_str) >= 8 and any(sep in val_str for sep in ("-", "/", "T")):
                    pass
                else:
                    is_date = False
            except Exception:
                is_date = False

    if is_int:
        return "INTEGER"
    if is_float:
        return "REAL"
    if is_date:
        return "TIMESTAMP"
    return "TEXT"


def parse_csv_content(content_bytes: bytes) -> Tuple[List[str], List[List[Any]]]:
    """Parse CSV bytes into header and row list."""
    # Try UTF-8 decoding, fallback to latin-1
    try:
        text_content = content_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text_content = content_bytes.decode("latin-1")

    # Detect delimiter
    sample = text_content[:4096]
    delimiter = ","
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        delimiter = dialect.delimiter
    except Exception:
        if "\t" in sample and sample.count("\t") > sample.count(","):
            delimiter = "\t"
        elif ";" in sample and sample.count(";") > sample.count(","):
            delimiter = ";"

    reader = csv.reader(io.StringIO(text_content), delimiter=delimiter)
    rows = [r for r in reader if any(cell.strip() for cell in r)]
    if not rows:
        raise ValueError("The uploaded CSV file is empty.")

    header = rows[0]
    data_rows = rows[1:]
    return header, data_rows


def parse_xlsx_content(content_bytes: bytes) -> Tuple[List[str], List[List[Any]], str]:
    """Parse Excel XLSX bytes using openpyxl."""
    import openpyxl

    wb = openpyxl.load_workbook(filename=io.BytesIO(content_bytes), data_only=True, read_only=True)
    sheet_names = wb.sheetnames
    if not sheet_names:
        raise ValueError("The Excel workbook contains no sheets.")

    first_sheet = wb[sheet_names[0]]
    raw_rows: List[List[Any]] = []
    for row in first_sheet.iter_rows(values_only=True):
        if any(cell is not None and str(cell).strip() != "" for cell in row):
            raw_rows.append(list(row))

    wb.close()

    if not raw_rows:
        raise ValueError("The Excel sheet is empty.")

    header = [str(cell) if cell is not None else "" for cell in raw_rows[0]]
    data_rows = raw_rows[1:]
    sheet_title = sheet_names[0]
    return header, data_rows, sheet_title


def process_file_upload(file: UploadFile, content: bytes) -> Dict[str, Any]:
    """
    Validate, parse, and store CSV/Excel file in an SQLite database.
    Returns metadata, columns, preview, and SQLite file path.
    """
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise ValueError(f"File size exceeds limit of {MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB.")

    filename = file.filename or "dataset"
    ext = Path(filename).suffix.lower()

    if ext not in (".csv", ".xlsx"):
        raise ValueError(f"Unsupported file format '{ext}'. Only CSV and XLSX are allowed.")

    base_name = Path(filename).stem
    clean_table_name = sanitize_identifier(base_name, fallback_prefix="dataset")

    if ext == ".csv":
        header, rows = parse_csv_content(content)
        db_type = "csv"
    else:
        header, rows, sheet_title = parse_xlsx_content(content)
        if sheet_title and sheet_title != "Sheet1":
            clean_table_name = sanitize_identifier(sheet_title, fallback_prefix="dataset")
        db_type = "excel"

    if not rows:
        raise ValueError("Uploaded file has headers but contains no data rows.")

    # Generate unique clean column names
    seen_cols = set()
    col_names = []
    for i, col in enumerate(header):
        name = sanitize_identifier(col, fallback_prefix=f"col_{i+1}")
        candidate = name
        counter = 1
        while candidate in seen_cols:
            candidate = f"{name}_{counter}"
            counter += 1
        seen_cols.add(candidate)
        col_names.append(candidate)

    # Infer data types using up to 100 sample rows
    num_cols = len(col_names)
    sample_size = min(len(rows), 100)
    col_types = []
    for c_idx in range(num_cols):
        sample_vals = [
            str(rows[r_idx][c_idx])
            for r_idx in range(sample_size)
            if c_idx < len(rows[r_idx]) and rows[r_idx][c_idx] is not None
        ]
        col_types.append(infer_sqlite_type(sample_vals))

    # Create SQLite database for this dataset
    db_id = str(uuid.uuid4())
    db_path = UPLOAD_DIR / f"{db_id}.db"

    conn = sqlite3.connect(str(db_path))
    try:
        cursor = conn.cursor()

        # Build CREATE TABLE
        col_defs = [f'"{col_names[i]}" {col_types[i]}' for i in range(num_cols)]
        create_sql = f'CREATE TABLE "{clean_table_name}" ({", ".join(col_defs)});'
        cursor.execute(create_sql)

        # Build INSERT
        placeholders = ", ".join(["?"] * num_cols)
        insert_sql = f'INSERT INTO "{clean_table_name}" VALUES ({placeholders});'

        # Normalize and insert rows in batches
        batch: List[List[Any]] = []
        for row in rows:
            padded_row = list(row) + [None] * (num_cols - len(row))
            norm_row = []
            for i, val in enumerate(padded_row[:num_cols]):
                if val is None or str(val).strip() == "" or str(val).strip().lower() in ("null", "none", "nan"):
                    norm_row.append(None)
                elif col_types[i] == "INTEGER":
                    try:
                        norm_row.append(int(float(str(val).replace(",", ""))))
                    except Exception:
                        norm_row.append(None)
                elif col_types[i] == "REAL":
                    try:
                        norm_row.append(float(str(val).replace(",", "")))
                    except Exception:
                        norm_row.append(None)
                else:
                    norm_row.append(str(val))
            batch.append(norm_row)
            if len(batch) >= 1000:
                cursor.executemany(insert_sql, batch)
                batch = []

        if batch:
            cursor.executemany(insert_sql, batch)

        conn.commit()
    finally:
        conn.close()

    # Create preview of first 20 rows
    preview_rows = []
    for r in rows[:20]:
        preview_dict = {}
        for i, col in enumerate(col_names):
            preview_dict[col] = r[i] if i < len(r) else None
        preview_rows.append(preview_dict)

    column_info = [
        {"name": col_names[i], "type": col_types[i], "nullable": True}
        for i in range(num_cols)
    ]

    return {
        "db_id": db_id,
        "file_path": str(db_path),
        "database_type": db_type,
        "table_name": clean_table_name,
        "filename": filename,
        "row_count": len(rows),
        "column_count": num_cols,
        "columns": column_info,
        "preview_rows": preview_rows,
    }
