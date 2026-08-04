DEFAULT_MAX_CONNECTIONS = 500


class ConnectionManager:
    def __init__(self, max_connections: int = DEFAULT_MAX_CONNECTIONS):
        self.active = set()
        self.max_connections = max_connections

    def connect(self, websocket) -> bool:
        if len(self.active) >= self.max_connections:
            return False
        self.active.add(websocket)
        return True

    def disconnect(self, websocket):
        self.active.discard(websocket)

    async def broadcast(self, message: dict):
        dead = []
        for websocket in list(self.active):
            try:
                await websocket.send_json(message)
            except Exception:
                dead.append(websocket)
        for websocket in dead:
            self.active.discard(websocket)


manager = ConnectionManager()
