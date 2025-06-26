from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uuid
from DMXEnttecPro import Controller
import serial.tools.list_ports
import os
import json

app = FastAPI()

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- File Paths ---
SETTINGS_FILE = "settings.json"
SHOW_FILE = "show.json"
OFL_FIXTURES_DIR = "ofl_export_ofl" # Relative path to the OFL fixtures directory

# --- Global State ---
dmx: Controller | None = None
dmx_port: str | None = None
show_data: Dict[str, Any] = {}
dmx_universe_values: List[int] = [0] * 512 # Initialize DMX universe values to 0

# --- Data Loading and Saving ---
def load_show_data():
    global show_data
    if os.path.exists(SHOW_FILE):
        with open(SHOW_FILE, "r") as f:
            try:
                show_data = json.load(f)
                print("Loaded show data from show.json")
            except json.JSONDecodeError:
                print("show.json is empty or corrupted. Starting with empty show.")
                show_data = {"fixtures": [], "groups": [], "cues": []}
    else:
        print("show.json not found. Starting with empty show.")
        show_data = {"fixtures": [], "groups": [], "cues": []}

def save_show_data():
    with open(SHOW_FILE, "w") as f:
        json.dump(show_data, f, indent=4)
        print("Saved show data to show.json")

def load_settings():
    global dmx_port
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "r") as f:
            settings = json.load(f)
            dmx_port = settings.get("dmx_port")
            print(f"Loaded DMX port from settings: {dmx_port}")

def save_settings():
    with open(SETTINGS_FILE, "w") as f:
        json.dump({"dmx_port": dmx_port}, f)
        print(f"Saved DMX port to settings: {dmx_port}")

def initialize_dmx():
    global dmx, dmx_port
    if dmx:
        dmx.close()
        dmx = None
    if dmx_port:
        try:
            dmx = Controller(dmx_port)
            print(f"Successfully initialized DmxPy on port: {dmx_port}")
        except Exception as e:
            print(f"Error initializing DmxPy on {dmx_port}: {e}")
            dmx = None

# --- Pydantic Models ---
class DMXChannel(BaseModel):
    channel: int
    value: int

class DMXPort(BaseModel):
    port: str

class Fixture(BaseModel):
    id: Optional[str] = None
    name: str
    address: int
    count: int = 1
    mode: str = "default"
    ofl_key: Optional[str] = None
    ofl_modes: Optional[List[Dict[str, Any]]] = None

# --- API Endpoints ---
@app.get("/api/ofl_fixtures")
async def get_ofl_fixtures():
    fixtures_path = os.path.join(os.path.dirname(__file__), OFL_FIXTURES_DIR)
    if not os.path.exists(fixtures_path):
        raise HTTPException(status_code=404, detail="OFL Fixtures directory not found")
    
    fixture_files = []
    for root, _, files in os.walk(fixtures_path):
        for file in files:
            if file.endswith(".json"):
                # Store relative path from OFL_FIXTURES_DIR
                relative_path = os.path.relpath(os.path.join(root, file), fixtures_path)
                fixture_files.append(relative_path)
    return {"files": sorted(fixture_files)}

@app.get("/api/ofl_fixtures/{file_path:path}")
async def get_ofl_fixture_data(file_path: str):
    full_path = os.path.join(os.path.dirname(__file__), OFL_FIXTURES_DIR, file_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Fixture file not found")
    
    with open(full_path, "r") as f:
        try:
            fixture_data = json.load(f)
            # Extract relevant OFL data for frontend
            ofl_name = fixture_data.get("name", "Unknown Fixture")
            ofl_modes = fixture_data.get("modes", [])
            return {"name": ofl_name, "modes": ofl_modes}
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="Invalid JSON in fixture file")

@app.get("/api/show")
async def get_show_data():
    return show_data

@app.post("/api/fixtures")
async def add_fixture(fixture: Fixture):
    if fixture.id is None:
        fixture.id = str(uuid.uuid4())
    show_data["fixtures"].append(fixture.dict())
    save_show_data()
    return fixture

@app.put("/api/fixtures/{fixture_id}")
async def update_fixture(fixture_id: str, fixture_data: Fixture):
    index = next((i for i, f in enumerate(show_data["fixtures"]) if f["id"] == fixture_id), None)
    if index is not None:
        show_data["fixtures"][index] = fixture_data.dict()
        save_show_data()
        return fixture_data
    raise HTTPException(status_code=404, detail="Fixture not found")

@app.delete("/api/fixtures/{fixture_id}")
async def delete_fixture(fixture_id: str):
    initial_len = len(show_data["fixtures"])
    show_data["fixtures"] = [f for f in show_data["fixtures"] if f["id"] != fixture_id]
    if len(show_data["fixtures"]) < initial_len:
        save_show_data()
        return {"message": "Fixture deleted"}
    raise HTTPException(status_code=404, detail="Fixture not found")

@app.post("/api/set_channel")
async def set_dmx_channel(dmx_channel: DMXChannel):
    if not (1 <= dmx_channel.channel <= 512):
        raise HTTPException(status_code=400, detail="Channel must be between 1 and 512")
    if not (0 <= dmx_channel.value <= 255):
        raise HTTPException(status_code=400, detail="Value must be between 0 and 255")
    
    # Update in-memory universe value
    dmx_universe_values[dmx_channel.channel - 1] = dmx_channel.value

    if dmx:
        try:
            dmx.set_channel(dmx_channel.channel, dmx_channel.value)
            dmx.submit()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error sending DMX data: {e}")
    return {"message": f"Channel {dmx_channel.channel} set to {dmx_channel.value}"}

@app.get("/api/dmx_universe_values")
async def get_dmx_universe_values():
    return {"values": dmx_universe_values}

@app.get("/api/dmx_status")
async def get_dmx_status():
    return {"connected": dmx is not None, "port": dmx_port}

@app.get("/api/ports")
async def get_available_ports():
    ports = [port.device for port in serial.tools.list_ports.comports()]
    return {"ports": ports, "selected_port": dmx_port}

@app.post("/api/set_dmx_port")
async def set_dmx_port(data: DMXPort):
    global dmx_port
    dmx_port = data.port
    save_settings()
    initialize_dmx()
    return {"message": f"DMX port set to {dmx_port}", "connected": dmx is not None}

# --- Application Startup ---
@app.on_event("startup")
async def startup_event():
    load_settings()
    load_show_data()
    initialize_dmx()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)