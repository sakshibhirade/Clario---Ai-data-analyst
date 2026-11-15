from sqlalchemy import inspect

from .connection import engine


def get_database_schema():
    inspector = inspect(engine)

    schema = {}

    tables = inspector.get_table_names()

    for table_name in tables:
        columns = inspector.get_columns(table_name)
        foreign_keys = inspector.get_foreign_keys(table_name)

        schema[table_name] = {
            "columns": [
                {
                    "name": column["name"],
                    "type": str(column["type"]),
                    "nullable": column["nullable"],
                }
                for column in columns
            ],
            "foreign_keys": [
                {
                    "column": fk["constrained_columns"],
                    "references_table": fk["referred_table"],
                    "references_columns": fk["referred_columns"],
                }
                for fk in foreign_keys
            ],
        }

    return schema