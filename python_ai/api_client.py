import requests

class ScoundrelAPIClient:
    BASE_URL = "http://localhost:3001/api/game"

    def __init__(self):
        self.session_id = None

    def start_game(self):
        resp = requests.post(f"{self.BASE_URL}/start")
        resp.raise_for_status()
        data = resp.json()
        self.session_id = data["sessionId"]
        return data["state"]

    def get_state(self):
        resp = requests.get(f"{self.BASE_URL}/state/{self.session_id}")
        resp.raise_for_status()
        return resp.json()["state"]

    def avoid_room(self):
        resp = requests.post(f"{self.BASE_URL}/avoid-room/{self.session_id}")
        resp.raise_for_status()
        return resp.json()["state"]

    def enter_room(self):
        resp = requests.post(f"{self.BASE_URL}/enter-room/{self.session_id}")
        resp.raise_for_status()
        return resp.json()["state"]

    def act_on_card(self, card_idx, mode=None):
        payload = {"cardIdx": card_idx}
        if mode:
            payload["mode"] = mode
        resp = requests.post(f"{self.BASE_URL}/act/{self.session_id}", json=payload)
        resp.raise_for_status()
        return resp.json()["state"]
