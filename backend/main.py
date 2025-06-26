from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict
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

SETTINGS_FILE = "settings.json"
GROUPS_FILE = "groups.json"
dmx = None
dmx_port = None

# In-memory storage, loaded from files
groups: Dict[str, List[int]] = {}

def load_settings():
    global dmx_port
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "r") as f:
            settings = json.load(f)
            dmx_port = settings.get("dmx_port")
            print(f"Loaded DMX port from settings: {dmx_port}")
    else:
        print("Settings file not found. Using default DMX port.")

def save_settings():
    with open(SETTINGS_FILE, "w") as f:
        json.dump({"dmx_port": dmx_port}, f)
        print(f"Saved DMX port to settings: {dmx_port}")

def load_groups():
    global groups
    if os.path.exists(GROUPS_FILE):
        with open(GROUPS_FILE, "r") as f:
            try:
                groups = json.load(f)
                print("Loaded groups from groups.json")
            except json.JSONDecodeError:
                print("groups.json is empty or corrupted. Starting with empty groups.")
                groups = {}
    else:
        print("groups.json not found. Starting with empty groups.")
        groups = {}

def save_groups():
    with open(GROUPS_FILE, "w") as f:
        json.dump(groups, f, indent=4)
        print("Saved groups to groups.json")

def initialize_dmx():
    global dmx
    global dmx_port
    if dmx:
        del dmx # Close existing connection
        dmx = None

    if dmx_port:
        try:
            dmx = Controller(dmx_port)
            print(f"Successfully initialized DmxPy on port: {dmx_port}")
        except Exception as e:
            print(f"Error initializing DmxPy on {dmx_port}: {e}")
            dmx = None
    else:
        print("No DMX port selected. DMX functionality will be simulated.")

# Load settings, groups, and initialize DMX on startup
load_settings()
load_groups()
initialize_dmx()

class DMXChannel(BaseModel):
    channel: int
    value: int

class DMXGroupCreate(BaseModel):
    name: str
    channels: List[int]

class DMXGroupResponse(BaseModel):
    name: str
    channels: List[int]

class DMXGroupControl(BaseModel):
    name: str
    value: int

class DMXPort(BaseModel):
    port: str

@app.post("/api/set_channel")
async def set_dmx_channel(dmx_channel: DMXChannel):
    if not (1 <= dmx_channel.channel <= 512):
        raise HTTPException(status_code=400, detail="Channel must be between 1 and 512")
    if not (0 <= dmx_channel.value <= 255):
        raise HTTPException(status_code=400, detail="Value must be between 0 and 255")

    if dmx:
        try:
            dmx.set_channel(dmx_channel.channel, dmx_channel.value)
            dmx.submit()
            print(f"Setting DMX channel {dmx_channel.channel} to value {dmx_channel.value}")
        except Exception as e:
            print(f"Error sending DMX data: {e}")
            raise HTTPException(status_code=500, detail=f"Error sending DMX data: {e}")
    else:
        print(f"DMX device not initialized. Setting DMX channel {dmx_channel.channel} to value {dmx_channel.value} (simulated).")

    return {"message": f"Channel {dmx_channel.channel} set to {dmx_channel.value}"}

@app.post("/api/groups")
async def create_dmx_group(group_data: DMXGroupCreate):
    if not group_data.name:
        raise HTTPException(status_code=400, detail="Group name cannot be empty")
    if not group_data.channels:
        raise HTTPException(status_code=400, detail="Group must contain at least one channel")
    for channel in group_data.channels:
        if not (1 <= channel <= 512):
            raise HTTPException(status_code=400, detail=f"Channel {channel} is out of valid range (1-512)")

    if group_data.name in groups:
        raise HTTPException(status_code=409, detail=f"Group '{group_data.name}' already exists")

    groups[group_data.name] = sorted(list(set(group_data.channels))) # Store unique, sorted channels
    save_groups()
    print(f"Created group '{group_data.name}' with channels: {groups[group_data.name]}")
    return {"message": f"Group '{group_data.name}' created successfully"}

@app.get("/api/groups", response_model=List[DMXGroupResponse])
async def get_dmx_groups():
    return [{"name": name, "channels": channels} for name, channels in groups.items()]

@app.post("/api/set_group")
async def set_dmx_group(group_control: DMXGroupControl):
    if not (0 <= group_control.value <= 255):
        raise HTTPException(status_code=400, detail="Value must be between 0 and 255")

    if group_control.name not in groups:
        raise HTTPException(status_code=404, detail=f"Group '{group_control.name}' not found")

    channels_to_set = groups[group_control.name]
    if dmx:
        try:
            for channel in channels_to_set:
                dmx.set_channel(channel, group_control.value)
            dmx.submit()
            print(f"Setting group '{group_control.name}' (channels {channels_to_set}) to value {group_control.value}")
        except Exception as e:
            print(f"Error sending DMX data for group '{group_control.name}': {e}")
            raise HTTPException(status_code=500, detail=f"Error sending DMX data for group: {e}")
    else:
        print(f"DMX device not initialized. Setting group '{group_control.name}' (channels {channels_to_set}) to value {group_control.value} (simulated).")

    return {"message": f"Group '{group_control.name}' set to {group_control.value}"}

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

@app.get("/")
async def read_root():
    return {"message": "DMX Software Backend is running!"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
