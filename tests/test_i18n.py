import json
import unittest
from pathlib import Path
from web.i18n import locale_from_accept_language, localized_message

class I18nTests(unittest.TestCase):
    def test_catalogues_are_symmetric(self):
        root = Path(__file__).parents[1] / "web" / "locales"
        fr = json.loads((root / "fr.json").read_text())
        en = json.loads((root / "en.json").read_text())
        self.assertEqual(set(fr), set(en))

    def test_accept_language_priority_and_fallback(self):
        self.assertEqual(locale_from_accept_language("fr-FR, en;q=0.8"), "fr")
        self.assertEqual(locale_from_accept_language("de-DE, en;q=0.8"), "en")
        self.assertEqual(locale_from_accept_language(None), "en")

    def test_technical_codes_are_not_translated(self):
        self.assertEqual(localized_message("HEARTBEAT_STALE", "fr"), "HEARTBEAT_STALE")
        self.assertEqual(localized_message("Project not found", "fr"), "Projet introuvable")
