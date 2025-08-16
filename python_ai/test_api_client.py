from api_client import ScoundrelAPIClient

if __name__ == "__main__":
    client = ScoundrelAPIClient()
    state = client.start_game()
    print("Initial state:", state)
    state = client.enter_room()
    print("After entering room:", state)
    state = client.act_on_card(0, mode="attack")
    print("After acting on card 0 (attack):", state)
    state = client.avoid_room()
    print("After avoiding room:", state)
    # You can continue to interact and print states as needed
