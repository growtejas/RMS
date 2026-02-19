"""
Quick script to verify PostgreSQL connection using backend/.env.
Run from backend folder: python check_db_connection.py
"""
import os
import sys
from pathlib import Path

# Load .env from backend directory
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

def main():
    print("DB config from .env:")
    print(f"  DB_HOST={DB_HOST}")
    print(f"  DB_PORT={DB_PORT}")
    print(f"  DB_NAME={DB_NAME}")
    print(f"  DB_USER={DB_USER}")
    print(f"  DB_PASSWORD={'*' * (len(DB_PASSWORD or ''))}")
    print()

    if not all([DB_HOST, DB_PORT, DB_NAME, DB_USER]):
        print("ERROR: Set DB_HOST, DB_PORT, DB_NAME, DB_USER (and DB_PASSWORD) in backend/.env")
        sys.exit(1)

    try:
        from sqlalchemy import create_engine, text
        url = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD or ''}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
        engine = create_engine(url, connect_args={"connect_timeout": 5})
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("OK: Database is reachable.")
    except Exception as e:
        print("ERROR: Cannot connect to database.")
        print(f"  {type(e).__name__}: {e}")
        print()
        print("Check:")
        print("  1. PostgreSQL is running (e.g. Windows: Services -> postgresql; or: pg_ctl status)")
        print("  2. DB_HOST/DB_PORT in backend/.env match your Postgres (default localhost:5432)")
        print("  3. Database exists: psql -U postgres -c \"CREATE DATABASE rbm_rfm;\"")
        print("  4. DB_USER/DB_PASSWORD are correct for that database")
        sys.exit(1)

if __name__ == "__main__":
    main()
