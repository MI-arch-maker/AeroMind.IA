from pathlib import Path
import pytest
from web import cad_kernel as cad


@pytest.mark.parametrize("definition", [b"#123=DOCUMENT_FILE('private','/etc/passwd',$,$);", b"REFERENCE; #123='file:///etc/passwd'; ENDSEC;", b"#123=EXTERNAL_SOURCE('/etc/passwd');", b"#123=DOC/*split*/UMENT_FILE('test','/etc/passwd',$,$);"])
def test_external_step_profile_rejected_before_native_reader(monkeypatch, definition):
    # Comments may be placed between STEP tokens, but not inside an entity name.
    # The first three are valid external-profile tokens; the last is invalid STEP
    # and the reader must reject it (it cannot be accepted as a valid solid).
    if definition.startswith(b"#123=DOC/*split*/"):
        with pytest.raises(cad.CadError):
            cad.import_model(b"ISO-10303-21;HEADER;ENDSEC;DATA;" + definition + b"ENDSEC;END-ISO-10303-21;", "external.step")
        return
    called = []
    def forbidden_reader():
        called.append(True)
        raise AssertionError("Native external resolver must not be reached")
    monkeypatch.setattr(cad, "STEPCAFControl_Reader", forbidden_reader)
    with pytest.raises(cad.CadError, match="External STEP references"):
        cad.import_model(b"ISO-10303-21;HEADER;ENDSEC;DATA;" + definition + b"ENDSEC;END-ISO-10303-21;", "external.step")
    assert not called


def test_quoted_label_and_comment_are_not_external_resolvers():
    path = Path(__file__).resolve().parents[1] / "fixtures/cad/inch_units_ap242.step"
    data = path.read_bytes().replace(b"ISO-10303-21;", b"ISO-10303-21;\n/* DOCUMENT_FILE('not a reference') */", 1)
    model = cad.import_model(data, "label.step")
    assert len(model.parts) == 1
    assert model.source["external_references_followed"] is False
