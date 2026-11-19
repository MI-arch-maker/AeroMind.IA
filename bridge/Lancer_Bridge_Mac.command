#!/bin/bash
cd "/Volumes/Tchimissy Marcel/Aeromind bridge"
lsof -ti:14550,8765 | xargs kill -9 2>/dev/null
python3 aeromind_bridge.py &
sleep 1
python3 sim_flight.py
