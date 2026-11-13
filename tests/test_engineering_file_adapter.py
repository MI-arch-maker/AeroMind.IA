from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

from web.engineering_connector_registry import connector_catalog
from web.engineering_files import (
    FileValidationError,
    export_csv_file,
    inspect_csv_file,
    inspect_step_part21,
)


class EngineeringFileAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="aeromind-engineering-test-")
        self.root = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write(self, name: str, content: str | bytes) -> Path:
        path = self.root / name
        path.write_bytes(content if isinstance(content, bytes) else content.encode("utf-8"))
        return path

    def test_bom_csv_dry_run_normalizes_data_without_executing_formula_like_text(self) -> None:
        source = self.write(
            "bom.csv",
            "part_id,revision,name,quantity,quantity_unit,material_id,unit_mass_kg,source_ref\n"
            'P-1,A,"=1+1",2,ea,AL-6061,0.25,design-01\n',
        )
        normalized = self.root / "normalized.jsonl"
        report = inspect_csv_file(source, normalized, "aeromind.bom.v1", "utf8-comma-v1")
        self.assertEqual(report["accepted_records"], 1)
        self.assertEqual(report["rejected_records"], 0)
        self.assertFalse(report["geometry_imported"])
        self.assertTrue(any(w["code"] == "CSV_FORMULA_LIKE_TEXT_INERT" for w in report["warnings"]))
        record = json.loads(normalized.read_text().splitlines()[0])
        self.assertEqual(record["name"], "=1+1")
        output = self.root / "spreadsheet.csv"
        self.assertEqual(export_csv_file(normalized, output, "aeromind.bom.v1", "spreadsheet-safe"), 1)
        with output.open(newline="", encoding="utf-8") as handle:
            exported = next(csv.DictReader(handle))
        self.assertEqual(exported["name"], "\t=1+1")
        self.assertEqual(exported["quantity"], "2")

    def test_bom_rejects_invalid_rows_and_preserves_partial_report(self) -> None:
        source = self.write(
            "partial.csv",
            "part_id,revision,name,quantity,quantity_unit,material_id,unit_mass_kg,source_ref\n"
            "P-1,A,valid-part,1,ea,,,\n"
            "P-2,A,invalid-zero,0,ea,,,\n",
        )
        normalized = self.root / "partial.jsonl"
        report = inspect_csv_file(source, normalized, "aeromind.bom.v1", "utf8-comma-v1")
        self.assertEqual(report["accepted_records"], 1)
        self.assertEqual(report["rejected_records"], 1)
        self.assertEqual(report["row_errors"][0]["row"], 3)

    def test_semicolon_dialect_is_explicit_and_round_trips(self) -> None:
        source = self.write(
            "bom-semicolon.csv",
            "part_id;revision;name;quantity;quantity_unit;material_id;unit_mass_kg;source_ref\n"
            "P-1;B;wing rib;1;piece;;;\n",
        )
        report = inspect_csv_file(source, self.root / "normalized.jsonl", "aeromind.bom.v1", "utf8-semicolon-v1")
        self.assertEqual(report["input_delimiter"], ";")
        self.assertTrue(any(w["code"] == "CSV_DIALECT_EXPLICIT" for w in report["warnings"]))

    def test_bom_dialect_mismatch_is_rejected(self) -> None:
        source = self.write("bom-bom.csv", b"\xef\xbb\xbfpart_id,revision,name,quantity\nP-1,A,part,1\n")
        with self.assertRaises(FileValidationError) as caught:
            inspect_csv_file(source, self.root / "normalized.jsonl", "aeromind.bom.v1", "utf8-comma-v1")
        self.assertEqual(caught.exception.code, "DIALECT_MISMATCH")

    def test_simulation_results_require_valid_units_and_utc_timestamps(self) -> None:
        source = self.write(
            "results.csv",
            "run_id,timestamp_utc,signal,value,unit,frame,quality_flag,source\n"
            "R-1,2026-11-01T10:00:00Z,velocity_x,12.5,m/s,NED,good,simulator\n",
        )
        report = inspect_csv_file(source, self.root / "results.jsonl", "aeromind.simulation-results.v1", "utf8-comma-v1")
        self.assertEqual(report["accepted_records"], 1)
        self.assertEqual(report["evidence_level"], "parsed_and_validated")

    def test_step_part21_reports_structure_only_not_geometry(self) -> None:
        step = self.write(
            "minimal.step",
            "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('sample'),'2;1');\n"
            "FILE_SCHEMA(('AP242'));\nENDSEC;\nDATA;\n"
            "#1=PRODUCT('id','name','',());\nENDSEC;\nEND-ISO-10303-21;\n",
        )
        report = inspect_step_part21(step)
        self.assertTrue(report["part21_envelope_valid"])
        self.assertTrue(report["recognized_ap_family"])
        self.assertEqual(report["data_entity_count"], 1)
        self.assertEqual(report["evidence_level"], "structure_only")
        self.assertFalse(report["geometry_imported"])
        self.assertFalse(report["pmi_imported"])

    def test_step_duplicate_entity_ids_are_rejected(self) -> None:
        step = self.write(
            "duplicate.step",
            "ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('AP242'));\nENDSEC;\nDATA;\n"
            "#1=PRODUCT('a','b','',());\n#1=PRODUCT('c','d','',());\nENDSEC;\nEND-ISO-10303-21;\n",
        )
        with self.assertRaises(FileValidationError) as caught:
            inspect_step_part21(step)
        self.assertEqual(caught.exception.code, "STEP_DUPLICATE_ENTITY_ID")

    def test_catalog_reports_exactly_13_families_without_false_connected_state(self) -> None:
        catalog = connector_catalog()
        self.assertEqual(len(catalog["items"]), 13)
        self.assertTrue(all(item["status"] == "configuration_required" for item in catalog["items"]))
        self.assertTrue(all(item["last_exchange_test"] is None for item in catalog["items"]))
        self.assertFalse(catalog["physical_output_enabled"])


if __name__ == "__main__":
    unittest.main()
