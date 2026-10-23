import unittest
from sitl_modules.propulsion_model import new_state, step

class PropulsionModelTests(unittest.TestCase):
    def test_piston_consumes_fuel_and_updates_rpm(self):
        state = new_state("piston", 4.0)
        step(state, 1.0, 0.7)
        self.assertLess(state.fuel_remaining_kg, 4.0)
        self.assertGreater(state.rpm, 4000)
        self.assertTrue(state.as_dict()["simulation_only"])

    def test_jet_keeps_idle_fuel_flow_and_models_thermal_lag(self):
        state = new_state("jet", 2.0)
        step(state, 1.0, 0.0)
        self.assertGreater(state.fuel_flow_kg_s, 0)
        self.assertGreater(state.exhaust_temp_c, 20)

    def test_hybrid_draws_battery_and_reports_mode(self):
        state = new_state("hybrid", 3.0, 100.0)
        step(state, 1.0, 0.8)
        self.assertLess(state.battery_remaining_wh, 100.0)
        self.assertEqual(state.hybrid_mode, "assist")
        self.assertTrue(any(item.startswith("MODE_HYBRIDE") for item in state.as_dict()["alerts"]))

    def test_input_bounds(self):
        with self.assertRaises(ValueError):
            step(new_state(), 11, 0.5)
        with self.assertRaises(ValueError):
            step(new_state(), 1, 1.1)

if __name__ == "__main__":
    unittest.main()
