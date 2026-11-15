import io
from starlette.testclient import TestClient
from app.main import app

def run_tests():
    with TestClient(app) as client:
        print("=====================================================")
        print("CLARIO INSIGHT ENGINE - 6 DATASET VERIFICATION SUITE")
        print("=====================================================")

        # 1. SALES DATASET
        print("\n[TEST 1] Sales Dataset (Trends & Revenue Trajectory)")
        sales_csv = (
            "date,category,units_sold,revenue\n"
            "2026-01-01,Hardware,120,12000\n"
            "2026-02-01,Hardware,140,14500\n"
            "2026-03-01,Hardware,180,19200\n"
            "2026-04-01,Hardware,220,24000\n"
            "2026-05-01,Software,310,35000\n"
            "2026-06-01,Software,340,39000\n"
            "2026-07-01,Software,390,46000\n"
            "2026-08-01,Software,430,51000\n"
        ).encode()
        res1 = client.post(
            "/api/datasources/upload",
            files={"file": ("monthly_sales.csv", sales_csv, "text/csv")},
            data={"connection_name": "Sales Q1-Q2"}
        )
        assert res1.status_code == 200
        ds1_id = res1.json()["datasource"]["id"]

        ai_res1 = client.post("/api/insights/analyze", json={"datasource_id": ds1_id})
        assert ai_res1.status_code == 200
        report1 = ai_res1.json()["report"]
        print("-> Total insights:", report1["total_insights"], "| Trends:", report1["trends_count"])
        print("-> Executive Summary:", report1["executive_summary"][:120], "...")
        assert report1["trends_count"] >= 1
        client.delete(f"/api/datasources/{ds1_id}")
        print("-> PASSED")

        # 2. CUSTOMER DATASET (Distribution Skew)
        print("\n[TEST 2] Customer Dataset (Concentration Risk & Distribution Skew)")
        cust_rows = ["customer_id,country,plan\n"]
        for i in range(1, 41):
            c = "North America" if i <= 30 else "Europe"
            cust_rows.append(f"{i},{c},Pro\n")
        cust_csv = "".join(cust_rows).encode()
        res2 = client.post(
            "/api/datasources/upload",
            files={"file": ("customers.csv", cust_csv, "text/csv")},
            data={"connection_name": "Global Customers"}
        )
        assert res2.status_code == 200
        ds2_id = res2.json()["datasource"]["id"]

        ai_res2 = client.post("/api/insights/analyze", json={"datasource_id": ds2_id})
        assert ai_res2.status_code == 200
        items2 = ai_res2.json()["items"]
        skew_anomalies = [it for it in items2 if "Concentration" in it["title"] or "Dominates" in it["title"]]
        print("-> Detected Skew Anomalies:", len(skew_anomalies))
        assert len(skew_anomalies) >= 1
        print("-> Title:", skew_anomalies[0]["title"])
        client.delete(f"/api/datasources/{ds2_id}")
        print("-> PASSED")

        # 3. INVENTORY DATASET (Multi-metric & Segment Outliers)
        print("\n[TEST 3] Inventory Dataset (Stock Levels & Cost Valuation)")
        inv_csv = (
            "sku,category,units_in_stock,unit_cost\n"
            "SKU-1,Electronics,450,25.50\n"
            "SKU-2,Electronics,380,30.00\n"
            "SKU-3,Furniture,120,150.00\n"
            "SKU-4,Furniture,85,210.00\n"
            "SKU-5,Apparel,950,12.00\n"
            "SKU-6,Apparel,1100,8.50\n"
            "SKU-7,Office,600,5.20\n"
            "SKU-8,Office,720,4.80\n"
        ).encode()
        res3 = client.post(
            "/api/datasources/upload",
            files={"file": ("warehouse_inventory.csv", inv_csv, "text/csv")},
            data={"connection_name": "Warehouse Stock"}
        )
        assert res3.status_code == 200
        ds3_id = res3.json()["datasource"]["id"]

        ai_res3 = client.post("/api/insights/analyze", json={"datasource_id": ds3_id})
        assert ai_res3.status_code == 200
        report3 = ai_res3.json()["report"]
        print("-> Inventory Insights:", report3["total_insights"])
        assert report3["total_insights"] >= 1
        client.delete(f"/api/datasources/{ds3_id}")
        print("-> PASSED")

        # 4. DATASET WITH MISSING VALUES
        print("\n[TEST 4] Dataset with Missing Values (Data Quality Anomaly)")
        null_rows = ["id,item_name,defect_rate\n"]
        for i in range(1, 31):
            val = "" if i <= 12 else f"{0.02 * i:.2f}"
            null_rows.append(f"{i},Batch_{i},{val}\n")
        null_csv = "".join(null_rows).encode()
        res4 = client.post(
            "/api/datasources/upload",
            files={"file": ("quality_control.csv", null_csv, "text/csv")},
            data={"connection_name": "QA Records"}
        )
        assert res4.status_code == 200
        ds4_id = res4.json()["datasource"]["id"]

        ai_res4 = client.post("/api/insights/analyze", json={"datasource_id": ds4_id})
        assert ai_res4.status_code == 200
        items4 = ai_res4.json()["items"]
        null_anomalies = [it for it in items4 if "Missing Data" in it["title"] or "null" in str(it.get("detected_value", ""))]
        print("-> Found Missing Data Anomalies:", len(null_anomalies))
        assert len(null_anomalies) >= 1
        print("-> Details:", null_anomalies[0]["title"], f"({null_anomalies[0]['detected_value']})")
        client.delete(f"/api/datasources/{ds4_id}")
        print("-> PASSED")

        # 5. DATASET WITH UNUSUAL NUMERICAL SPIKES (Extreme IQR Outlier)
        print("\n[TEST 5] Dataset with Unusual Numerical Values (Spikes & Outliers)")
        spike_rows = ["tx_id,amount\n"]
        for i in range(1, 40):
            val = 25.0 + (i % 5) * 3
            spike_rows.append(f"{i},{val}\n")
        spike_rows.append("40,2850.0\n")
        spike_csv = "".join(spike_rows).encode()
        res5 = client.post(
            "/api/datasources/upload",
            files={"file": ("transactions.csv", spike_csv, "text/csv")},
            data={"connection_name": "Payment Stream"}
        )
        assert res5.status_code == 200
        ds5_id = res5.json()["datasource"]["id"]

        ai_res5 = client.post("/api/insights/analyze", json={"datasource_id": ds5_id})
        assert ai_res5.status_code == 200
        items5 = ai_res5.json()["items"]
        spike_anomalies = [it for it in items5 if "Spike" in it["title"] or it["methodology"] == "iqr_outlier_detection"]
        print("-> Detected Numerical Outliers:", len(spike_anomalies))
        assert len(spike_anomalies) >= 1
        print("-> Title:", spike_anomalies[0]["title"], f"(Severity: {spike_anomalies[0]['severity']})")
        client.delete(f"/api/datasources/{ds5_id}")
        print("-> PASSED")

        # 6. DATASET WITH INSUFFICIENT HISTORICAL INFORMATION
        print("\n[TEST 6] Dataset with Insufficient Historical Information")
        sparse_csv = (
            "id,note,val\n"
            "1,Init,10\n"
            "2,Second,20\n"
        ).encode()
        res6 = client.post(
            "/api/datasources/upload",
            files={"file": ("sparse.csv", sparse_csv, "text/csv")},
            data={"connection_name": "Sparse Log"}
        )
        assert res6.status_code == 200
        ds6_id = res6.json()["datasource"]["id"]

        ai_res6 = client.post("/api/insights/analyze", json={"datasource_id": ds6_id})
        assert ai_res6.status_code == 200
        report6 = ai_res6.json()["report"]
        print("-> Handled sparse dataset safely. Executive summary:", report6["executive_summary"][:100], "...")
        client.delete(f"/api/datasources/{ds6_id}")
        print("-> PASSED")

        print("\n>>> ALL 6 DIVERSE DATASET TEST SUITES PASSED FLAWLESSLY! <<<")

if __name__ == "__main__":
    run_tests()
