"""Extended material library backend — REST endpoints for the cockpit.

The catalog includes 10 categories of drone hardware. **All payloads are
non-weaponized** (delivery drop mechanisms, agricultural sprayers, lighting
systems, communication relays, observation cameras) — consistent with the
AeroMind non-weaponized platform contract (engineering/FINAL_REPORT_NON_WEAPONIZED_PLATFORM.md).

The static catalog (MATERIAL_CATALOG) is the curated default; user-added
custom items are persisted in the MaterialItem table.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Cookie, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from .app_auth_helpers import current_user
from .database import SessionLocal
from .models import MaterialItem


router = APIRouter(prefix="/api/materials", tags=["material-library"])


# ===========================================================================
# Catalog (10 categories, 32 items) — all non-weaponized
# ===========================================================================

MATERIAL_CATEGORIES: list[dict[str, str]] = [
    {"id": "propulsion", "label": "Propulsion", "icon": "fan", "description": "Moteurs, ESC, hélices, contrôleurs de vol moteur"},
    {"id": "energy", "label": "Énergie", "icon": "battery", "description": "Batteries, BMS, chargeurs, distributeurs"},
    {"id": "structure", "label": "Structure", "icon": "frame", "description": "Châssis, bras, train d'atterrissage, supports"},
    {"id": "avionics", "label": "Avionique", "icon": "cpu", "description": "Flight controllers, GPS, IMU, compas, baromètres"},
    {"id": "communication", "label": "Communication", "icon": "radio", "description": "Modules radio, antennes, liens télémétrie"},
    {"id": "optical", "label": "Optique & capteurs", "icon": "camera", "description": "Caméras, gimbals, thermiques, LIDAR, multispectrales"},
    {"id": "payload-non-weaponized", "label": "Payloads (non-armés)", "icon": "package", "description": "Drop mechanisms, sprayers, éclairage, relais comms — NON armés"},
    {"id": "safety", "label": "Sécurité", "icon": "shield", "description": "Parachutes, strobes, balises, flares de détresse civile"},
    {"id": "maintenance", "label": "Maintenance", "icon": "tool", "description": "Outils, pièces de rechange, chargeurs de terrain"},
    {"id": "electrical-arming-hardware", "label": "Hardware d'interconnexion électrique", "icon": "key", "description": "Bretelles d'armement électrique, connecteurs d'alimentation, switches d'armement — hardware électrique NON armement (P2-05 fix: renamed from armament-hardware)"},
]


MATERIAL_CATALOG: list[dict[str, Any]] = [
    # === Propulsion ===
    {
        "id": "motor-brushless-900kv",
        "category": "propulsion",
        "label": "Moteur brushless 900KV",
        "manufacturer": "T-MOTOR",
        "partNumber": "MN3110 KV900",
        "massKg": 0.115,
        "dimensions": "Ø37 × 25 mm ; arbre Ø5 mm",
        "electrical": "4-6S LiPo ; 600 W max ; 22 A max continu",
        "interfaces": "Hélice M5 ; mount 16×16 mm ; 3 phases bullet connectors",
        "use": "Moteur multirotor 600-800 mm ; poussée ~1.4 kg à 4S avec hélice 12×4",
        "compatibleAirframes": ["quadcopter", "vtol"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "motor-brushless-1400kv",
        "category": "propulsion",
        "label": "Moteur brushless 1400KV (250-450 mm)",
        "manufacturer": "Hobbywing",
        "partNumber": "XRotor 2207 KV1400",
        "massKg": 0.036,
        "dimensions": "Ø28 × 16 mm ; arbre Ø5 mm",
        "electrical": "4S LiPo ; 350 W max ; 35 A max",
        "interfaces": "Hélice M5 ; mount 16×19 mm ; 3 phases",
        "use": "Cinematic FPV / course ; poussée ~1.2 kg à 4S avec hélice 5×4.3",
        "compatibleAirframes": ["quadcopter"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "esc-60a-6s-foc",
        "category": "propulsion",
        "label": "ESC 60A 6S FOC",
        "manufacturer": "T-MOTOR",
        "partNumber": "ALPHA 60A 6S",
        "massKg": 0.063,
        "dimensions": "55 × 28 × 7 mm",
        "electrical": "6S LiPo ; 60 A burst 80 A ; FOC telemetry",
        "interfaces": "PWM / DShot300 / Multishot ; BLHeli_32 ; 3 phases",
        "use": "ESC FOC pour moteurs brushless multirotor 500-700 mm",
        "compatibleAirframes": ["quadcopter", "vtol"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "propeller-12x4-cf",
        "category": "propulsion",
        "label": "Hélice carbone 12×4 (paire)",
        "manufacturer": "T-MOTOR",
        "partNumber": "P12×4",
        "massKg": 0.014,
        "dimensions": "Diamètre 305 mm ; pas 102 mm",
        "electrical": "—",
        "interfaces": "Montage M5 ; rotation CW ou CCW",
        "use": "Hélice carbone pour moteurs MN3110 KV900",
        "compatibleAirframes": ["quadcopter", "vtol"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "propeller-5x4-3-blade",
        "category": "propulsion",
        "label": "Hélice 5×4×3 (tripale)",
        "manufacturer": "Gemfan",
        "partNumber": "5×4×3",
        "massKg": 0.004,
        "dimensions": "Diamètre 127 mm ; pas 102 mm ; tripale",
        "electrical": "—",
        "interfaces": "Montage M5",
        "use": "Hélice tripale FPV 250-280 mm",
        "compatibleAirframes": ["quadcopter"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },

    # === Energy ===
    {
        "id": "lipo-4s-1500mah",
        "category": "energy",
        "label": "Batterie LiPo 4S 1500 mAh 75C",
        "manufacturer": "Tattu",
        "partNumber": "TA-4S-1500-75",
        "massKg": 0.182,
        "dimensions": "75 × 35 × 28 mm",
        "electrical": "14.8 V nominal ; 1500 mAh ; 75C (112.5 A burst)",
        "interfaces": "Connecteur XT60 ; balance JST-XH 4S",
        "use": "Batterie multirotor 250-450 mm",
        "compatibleAirframes": ["quadcopter"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "lipo-6s-5000mah",
        "category": "energy",
        "label": "Batterie LiPo 6S 5000 mAh 25C",
        "manufacturer": "Tattu",
        "partNumber": "TA-6S-5000-25",
        "massKg": 0.645,
        "dimensions": "165 × 50 × 48 mm",
        "electrical": "22.2 V nominal ; 5000 mAh ; 25C (125 A burst)",
        "interfaces": "Connecteur XT90 ; balance JST-XH 6S",
        "use": "Batterie multirotor 500-700 mm ; ~12 min vol stationnaire",
        "compatibleAirframes": ["quadcopter", "vtol"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "bms-6s-current-sensor",
        "category": "energy",
        "label": "BMS 6S + capteur de courant",
        "manufacturer": "Holybro",
        "partNumber": "PM06 6S",
        "massKg": 0.038,
        "dimensions": "65 × 26 × 6 mm",
        "electrical": "6S LiPo ; 120 A max ; sortie 5V/3A + 12V passthrough",
        "interfaces": "Connecteur XT60 in/out ; I2C/SMBus",
        "use": "Module de distribution + mesure courant pour FC",
        "compatibleAirframes": ["quadcopter", "vtol", "fixed-wing"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "charger-field-portable",
        "category": "energy",
        "label": "Chargeur de terrain ISDT 60W",
        "manufacturer": "ISDT",
        "partNumber": "Q6 Lite 60W",
        "massKg": 0.131,
        "dimensions": "87 × 65 × 25 mm",
        "electrical": "Entrée 7-26V ; charge 60W max ; 1-6S LiPo",
        "interfaces": "Écran LCD ; XT60 ; balance JST-XH",
        "use": "Chargeur de terrain portatif ; recharge depuis batterie ou 12V voiture",
        "compatibleAirframes": [],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },

    # === Structure ===
    {
        "id": "frame-x500-v2",
        "category": "structure",
        "label": "Châssis X500 V2 (500 mm)",
        "manufacturer": "Holybro",
        "partNumber": "X500 V2 Frame Kit · SKU30120",
        "massKg": 0.610,
        "dimensions": "Empattement 500 mm ; corps 144×144×2 mm",
        "electrical": "—",
        "interfaces": "Motifs moteur 16×16 mm ; rails Ø10×250 mm",
        "use": "Kit de structure quadrirotor 500 mm ; nu (sans moteur)",
        "compatibleAirframes": ["quadcopter"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "frame-f450",
        "category": "structure",
        "label": "Châssis F450 (450 mm)",
        "manufacturer": "DJI",
        "partNumber": "F450 ARF Kit",
        "massKg": 0.280,
        "dimensions": "Empattement 450 mm",
        "electrical": "PCB intégré pour distribution moteur",
        "interfaces": "Mount 16×16 mm ; rail cargo",
        "use": "Frame économique quadrirotor 450 mm pour tests",
        "compatibleAirframes": ["quadcopter"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "landing-gear-f500",
        "category": "structure",
        "label": "Train d'atterrissage F500",
        "manufacturer": "Holybro",
        "partNumber": "LG-F500",
        "massKg": 0.085,
        "dimensions": "Hauteur 215 mm ; alu + plastique",
        "electrical": "—",
        "interfaces": "Fixation sur rail Ø10",
        "use": "Train d'atterrissage démontable pour F500",
        "compatibleAirframes": ["quadcopter"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },

    # === Avionics ===
    {
        "id": "fc-pixhawk-6c",
        "category": "avionics",
        "label": "Pixhawk 6C (FMUv6C)",
        "manufacturer": "Holybro",
        "partNumber": "Pixhawk 6C",
        "massKg": 0.040,
        "dimensions": "84 × 42 × 14 mm",
        "electrical": "5V input ; IMU triple gyro/accel ; baromètre MS5611",
        "interfaces": "GPS UART ; CAN ; 8× PWM ; 6× AUX ; USB-C",
        "use": "Flight controller ArduPilot/PX4-compatible",
        "compatibleAirframes": ["quadcopter", "vtol", "fixed-wing"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "gps-m9n",
        "category": "avionics",
        "label": "GPS M9N + compas",
        "manufacturer": "Holybro",
        "partNumber": "M9N-F9P",
        "massKg": 0.035,
        "dimensions": "47 mm diam ; poteau 10 mm",
        "electrical": "3.3-5V ; GPS + baromètre + compas HMC5983",
        "interfaces": "UART ; I2C ; LED NEO-M9N",
        "use": "Module GPS standalone pour FC",
        "compatibleAirframes": ["quadcopter", "vtol", "fixed-wing"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "gps-rtk-f9p",
        "category": "avionics",
        "label": "GPS RTK Ublox F9P (cm)",
        "manufacturer": "Holybro",
        "partNumber": "Here3 RTK",
        "massKg": 0.055,
        "dimensions": "55 mm diam",
        "electrical": "3.3-5V ; RTK cm-level precision",
        "interfaces": "UART ; CAN",
        "use": "GPS RTK pour précision centimétrique",
        "compatibleAirframes": ["quadcopter", "vtol", "fixed-wing"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "imu-icm42688",
        "category": "avionics",
        "label": "IMU ICM-42688 (haute perf)",
        "manufacturer": "TDK InvenSense",
        "partNumber": "ICM-42688",
        "massKg": 0.001,
        "dimensions": "Boîtier LGA 14-pin 2.5×3 mm",
        "electrical": "1.7-3.6V ; SPI/I2C",
        "interfaces": "SPI 24 MHz ; I2C 1 MHz",
        "use": "IMU 6-axis standalone pour intégration custom",
        "compatibleAirframes": [],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },

    # === Communication ===
    {
        "id": "radio-sik-900mhz",
        "category": "communication",
        "label": "Radio télémétrie SiK 900 MHz",
        "manufacturer": "Holybro",
        "partNumber": "Telemetry Radio V3 900MHz",
        "massKg": 0.027,
        "dimensions": "47 × 25 × 8 mm",
        "electrical": "5V ; 915/433 MHz ; 20 mW",
        "interfaces": "UART TTL ; SMA antenna",
        "use": "Lien télémétrie air-sol longue portée (~1 km)",
        "compatibleAirframes": ["quadcopter", "vtol", "fixed-wing"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "radio-microhard-2.4ghz",
        "category": "communication",
        "label": "Microhard 2.4GHz — lien HD",
        "manufacturer": "Microhard",
        "partNumber": "pDDL2450",
        "massKg": 0.067,
        "dimensions": "62 × 38 × 14 mm",
        "electrical": "5V ; 2.4 GHz ; 1 W max",
        "interfaces": "Ethernet ; UART ; SMA×2 (MIMO)",
        "use": "Lien vidéo/télémétrie longue portée (~5 km)",
        "compatibleAirframes": ["quadcopter", "vtol", "fixed-wing"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "antenna-omni-900mhz",
        "category": "communication",
        "label": "Antenne omnidirectionnelle 900 MHz 3dBi",
        "manufacturer": "Holybro",
        "partNumber": "ANT-900-3",
        "massKg": 0.025,
        "dimensions": "180 mm long ; SMA male",
        "electrical": "900 MHz ; 3 dBi",
        "interfaces": "SMA male",
        "use": "Antenne sol pour radio SiK 900 MHz",
        "compatibleAirframes": [],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },

    # === Optical & sensors ===
    {
        "id": "camera-gopro-hero12",
        "category": "optical",
        "label": "Caméra GoPro Hero12 Black",
        "manufacturer": "GoPro",
        "partNumber": "CHDHX-122",
        "massKg": 0.154,
        "dimensions": "71 × 50 × 34 mm",
        "electrical": "Batterie Enduro ; USB-C charge",
        "interfaces": "USB-C ; HDMI ; mount GoPro",
        "use": "Caméra cinématique 4K60 + stabilisation HyperSmooth",
        "compatibleAirframes": ["quadcopter", "vtol"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "thermal-flir-vue-pro",
        "category": "optical",
        "label": "Caméra thermique FLIR Vue Pro 640",
        "manufacturer": "FLIR",
        "partNumber": "VUEPRO-640-13MM",
        "massKg": 0.130,
        "dimensions": "56 × 50 × 50 mm",
        "electrical": "5V ; 4W",
        "interfaces": "PWM ; MAVLink ; HDMI",
        "use": "Caméra thermique 640×512 pour inspection industrielle",
        "compatibleAirframes": ["quadcopter", "vtol"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "gimbal-3axis-gh4",
        "category": "optical",
        "label": "Gimbal 3-axis GH4",
        "manufacturer": "Holybro",
        "partNumber": "GH4",
        "massKg": 0.420,
        "dimensions": "120 × 100 × 110 mm",
        "electrical": "12V ; 1.5A",
        "interfaces": "MAVLink CAN ; PWM",
        "use": "Gimbal 3 axes pour GoPro / Sony A7",
        "compatibleAirframes": ["quadcopter", "vtol"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "lidar-velodyne-puck",
        "category": "optical",
        "label": "LIDAR Velodyne Puck VLP-16",
        "manufacturer": "Velodyne",
        "partNumber": "VLP-16",
        "massKg": 0.830,
        "dimensions": "Ø100 × 73 mm",
        "electrical": "9-18V ; 8W",
        "interfaces": "Ethernet",
        "use": "LIDAR 16 channels pour cartographie 3D",
        "compatibleAirframes": ["vtol", "fixed-wing"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "multispectral-micasense-rededge",
        "category": "optical",
        "label": "MicaSense RedEdge-MX (multispectral)",
        "manufacturer": "MicaSense",
        "partNumber": "RedEdge-MX",
        "massKg": 0.170,
        "dimensions": "121 × 84 × 46 mm",
        "electrical": "5-15V ; 3.8W",
        "interfaces": "Ethernet ; DLS light sensor",
        "use": "Caméra multispectrale 5 bandes (agriculture)",
        "compatibleAirframes": ["quadcopter", "vtol"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },

    # === Payloads (NON-WEAPONIZED) ===
    {
        "id": "payload-drop-mechanism",
        "category": "payload-non-weaponized",
        "label": "Mécanisme de lâcher (livraison)",
        "manufacturer": "Holybro",
        "partNumber": "DROP-V2",
        "massKg": 0.090,
        "dimensions": "60 × 40 × 30 mm",
        "electrical": "5V ; servo PWM",
        "interfaces": "PWM ; MAVLink",
        "use": "Lâcher de charge utile (livraison / balise de détresse) — NON armé",
        "compatibleAirframes": ["quadcopter", "vtol"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "payload-agri-sprayer",
        "category": "payload-non-weaponized",
        "label": "Pulvérisateur agricole 5L",
        "manufacturer": "DJI Agriculture",
        "partNumber": "AGR-5L-V2",
        "massKg": 1.600,
        "dimensions": "Réservoir 5L + buse + pompe",
        "electrical": "12V ; 4A",
        "interfaces": "PWM ; MAVLink",
        "use": "Pulvérisateur agricole 5L (mapping phytosanitaire)",
        "compatibleAirframes": ["vtol", "quadcopter"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "payload-led-lighting",
        "category": "payload-non-weaponized",
        "label": "Éclairage LED 100W inspection",
        "manufacturer": "Cinematic",
        "partNumber": "LED-100W-INSPECT",
        "massKg": 0.450,
        "dimensions": "120 × 80 × 60 mm",
        "electrical": "12V ; 8A ; 10000 lm",
        "interfaces": "PWM dimming",
        "use": "Éclairage pour inspection en environnement sombre",
        "compatibleAirframes": ["quadcopter", "vtol"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "payload-comms-relay",
        "category": "payload-non-weaponized",
        "label": "Relais de communication (LTE/5G)",
        "manufacturer": "Microhard",
        "partNumber": "RELAY-LTE-5G",
        "massKg": 0.380,
        "dimensions": "110 × 70 × 30 mm",
        "electrical": "5-12V ; 6W",
        "interfaces": "Ethernet ; SIM slot",
        "use": "Relais LTE/5G — étend la couverture en zones isolées",
        "compatibleAirframes": ["vtol", "fixed-wing"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "payload-gas-detector",
        "category": "payload-non-weaponized",
        "label": "Capteur de gaz multi (CH4, CO2, O2)",
        "manufacturer": "Sensirion",
        "partNumber": "MULTI-GAS-V1",
        "massKg": 0.120,
        "dimensions": "60 × 50 × 30 mm",
        "electrical": "5V ; 0.5A",
        "interfaces": "I2C ; UART",
        "use": "Capteur de gaz pour inspection industrielle",
        "compatibleAirframes": ["quadcopter", "vtol"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },

    # === Safety ===
    {
        "id": "parachute-cirrus-50",
        "category": "safety",
        "label": "Parachute de récupération (1.5 kg)",
        "manufacturer": "Cirrus",
        "partNumber": "CIR-50",
        "massKg": 0.260,
        "dimensions": "Ø100 × 80 mm ; parachute 1.5 m",
        "electrical": "Servo + pyro 9V",
        "interfaces": "PWM ; pyro trigger",
        "use": "Parachute de récupération pour drone 1.5 kg",
        "compatibleAirframes": ["quadcopter", "vtol"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "strobe-light-aviation",
        "category": "safety",
        "label": "Strobe anti-collision aviation",
        "manufacturer": "Lume Cube",
        "partNumber": "AIR-STROBE-RED",
        "massKg": 0.045,
        "dimensions": "40 × 40 × 25 mm",
        "electrical": "Batterie intégrée 4h",
        "interfaces": "Mount GoPro ; aimant",
        "use": "Strobe rouge anti-collision (conformité EASA)",
        "compatibleAirframes": ["quadcopter", "vtol", "fixed-wing"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "flare-distress-civilian",
        "category": "safety",
        "label": "Flare de détresse civile (LED)",
        "manufacturer": "ACR Electronics",
        "partNumber": "DISTRESS-LED-V2",
        "massKg": 0.040,
        "dimensions": "120 × 35 mm",
        "electrical": "Batterie Li-ion 6h",
        "interfaces": "Mount 1/4-20",
        "use": "Flare LED de détresse civile (non pyrotechnique)",
        "compatibleAirframes": ["quadcopter", "vtol", "fixed-wing"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },

    # === Maintenance ===
    {
        "id": "tool-torque-screwdriver",
        "category": "maintenance",
        "label": "Tournevis dynamométrique 1-5 Nm",
        "manufacturer": "Wera",
        "partNumber": "TORQUE-VAR-1-5",
        "massKg": 0.420,
        "dimensions": "250 mm long",
        "electrical": "—",
        "interfaces": "Embout 1/4",
        "use": "Tournevis dynamométrique calibré (assemblage moteur/ESC)",
        "compatibleAirframes": [],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "tool-balancer-prop",
        "category": "maintenance",
        "label": "Équilibreur d'hélices magnétique",
        "manufacturer": "Dubro",
        "partNumber": "BAL-MAG",
        "massKg": 0.150,
        "dimensions": "120 × 60 × 60 mm",
        "electrical": "—",
        "interfaces": "Arbres Ø3/4/5/6/8 mm",
        "use": "Équilibrage statique des hélices",
        "compatibleAirframes": [],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },

    # === Armament hardware (NON weapon — electrical arming hardware) ===
    {
        "id": "arm-hardware-switch-key",
        "category": "electrical-arming-hardware",
        "label": "Interrupteur d'armement à clé",
        "manufacturer": "Apem",
        "partNumber": "KEY-SWITCH-2POS",
        "massKg": 0.060,
        "dimensions": "30 mm panel mount",
        "electrical": "10A 250VAC ; 2 positions (ON/OFF)",
        "interfaces": "Fils volants ; key 4mm",
        "use": "Switch à clé pour armement/désarmement électrique de la plateforme (NON-armement militaire)",
        "compatibleAirframes": [],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "arm-hardware-power-bus",
        "category": "electrical-arming-hardware",
        "label": "Bus de distribution d'armement",
        "manufacturer": "Holybro",
        "partNumber": "PDB-ARMBUS-6S",
        "massKg": 0.075,
        "dimensions": "70 × 35 × 8 mm",
        "electrical": "6S LiPo ; 100A burst ; 8 sorties ESC + FC",
        "interfaces": "XT60 in ; 8× ESC out ; FC rails",
        "use": "PDB avec switch d'armement électrique et LED de statut",
        "compatibleAirframes": ["quadcopter", "vtol"],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
    {
        "id": "arm-hardware-connector-magnetic",
        "category": "electrical-arming-hardware",
        "label": "Connecteur magnétique d'armement (anti-arrachement)",
        "manufacturer": "Molex",
        "partNumber": "MAG-CONN-2PIN",
        "massKg": 0.018,
        "dimensions": "20 × 15 mm",
        "electrical": "5A 24VDC ; 2 pins",
        "interfaces": "Câble 22 AWG",
        "use": "Connecteur magnétique anti-arrachement pour armement/désarmement rapide (livraison, drop)",
        "compatibleAirframes": [],
        "catalogSource": "manufacturer",
        "weaponized": False,
    },
]


# ===========================================================================
# Endpoints
# ===========================================================================


def _serialize_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item["id"],
        "category": item["category"],
        "label": item["label"],
        "manufacturer": item.get("manufacturer"),
        "partNumber": item.get("partNumber"),
        "massKg": item.get("massKg"),
        "dimensions": item.get("dimensions"),
        "electrical": item.get("electrical"),
        "interfaces": item.get("interfaces"),
        "use": item.get("use"),
        "compatibleAirframes": item.get("compatibleAirframes", []),
        "catalogSource": item.get("catalogSource", "manufacturer"),
        "weaponized": item.get("weaponized", False),
    }


@router.get("/catalog")
def catalog_endpoint(
    request: Request,
    category: str | None = Query(None, description="Filter by category"),
    q: str | None = Query(None, description="Search query"),
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """Return the static + user catalog. Optional category + free-text filter."""
    user = current_user(aeromind_session, authorization)
    items = [dict(it) for it in MATERIAL_CATALOG]
    # Append user items from DB if authenticated
    if user:
        with SessionLocal() as db:
            for row in db.scalars(select(MaterialItem).order_by(MaterialItem.category)):
                items.append({
                    "id": row.id,
                    "category": row.category,
                    "label": row.label,
                    "manufacturer": row.manufacturer,
                    "partNumber": row.part_number,
                    "massKg": row.mass_kg,
                    "dimensions": row.dimensions,
                    "electrical": row.electrical,
                    "interfaces": row.interfaces,
                    "use": row.use,
                    "compatibleAirframes": json.loads(row.compatible_airframes_json or "[]"),
                    "catalogSource": row.catalog_source,
                    "weaponized": row.weaponized,
                    "notes": row.notes,
                })
    # Filter
    if category:
        items = [it for it in items if it["category"] == category]
    if q:
        qn = q.strip().lower()
        items = [
            it for it in items
            if qn in (it["label"] + " " + (it.get("manufacturer") or "") + " " + (it.get("partNumber") or "") + " " + (it.get("use") or "")).lower()
        ]
    return JSONResponse({
        "categories": MATERIAL_CATEGORIES,
        "items": [_serialize_item(it) for it in items],
        "totalCount": len(items),
        "weaponizedItems": sum(1 for it in items if it.get("weaponized")),  # always 0 in non-weaponized platform
    }, headers={"Cache-Control": "no-store", "Vary": "Cookie"})


@router.get("/categories")
def categories_endpoint():
    """Return the 10 category definitions."""
    return JSONResponse({"categories": MATERIAL_CATEGORIES}, headers={"Cache-Control": "no-store"})


@router.post("/items")
async def add_custom_item(
    request: Request,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """Add a user-defined item. The `weaponized` field is forced to False —
    the platform contract forbids weaponized items.
    """
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    body = await request.json()
    item_id = str(body.get("id") or "").strip()
    if not item_id:
        return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": "id is required"}})
    category = str(body.get("category") or "").strip()
    if category not in [c["id"] for c in MATERIAL_CATEGORIES]:
        return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": f"category must be one of {[c['id'] for c in MATERIAL_CATEGORIES]}"}})
    label = str(body.get("label") or "").strip()
    if not label:
        return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": "label is required"}})
    # Force non-weaponized (security invariant)
    if body.get("weaponized") is True:
        return JSONResponse(status_code=403, content={"error": {"code": "WEAPONIZED_FORBIDDEN", "message": "AeroMind is a non-weaponized platform; weaponized items cannot be added"}})
    compatible_airframes = body.get("compatibleAirframes") or []
    with SessionLocal() as db:
        existing = db.get(MaterialItem, item_id)
        if existing is not None:
            return JSONResponse(status_code=409, content={"error": {"code": "ALREADY_EXISTS", "message": f"Item with id {item_id} already exists"}})
        item = MaterialItem(
            id=item_id,
            category=category,
            label=label,
            manufacturer=body.get("manufacturer"),
            part_number=body.get("partNumber"),
            mass_kg=body.get("massKg"),
            dimensions=body.get("dimensions"),
            electrical=body.get("electrical"),
            interfaces=body.get("interfaces"),
            use=body.get("use"),
            compatible_airframes_json=json.dumps(compatible_airframes, ensure_ascii=False),
            catalog_source="user",
            weaponized=False,  # forced
            notes=body.get("notes"),
            created_at=datetime.now(UTC),
        )
        db.add(item)
        db.commit()
    return JSONResponse({
        "id": item_id,
        "category": category,
        "label": label,
        "weaponized": False,
    }, status_code=201)


@router.delete("/items/{item_id}")
def delete_custom_item(
    item_id: str,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    with SessionLocal() as db:
        item = db.get(MaterialItem, item_id)
        if item is None:
            return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": "Item not found"}})
        db.delete(item)
        db.commit()
    return JSONResponse({"deleted": item_id})
