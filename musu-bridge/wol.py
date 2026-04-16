"""Wake-on-LAN: Magic Packet generation and UDP broadcast."""

import re
import socket


def send_magic_packet(
    mac: str,
    broadcast: str = "255.255.255.255",
    port: int = 9,
) -> bool:
    """Send a Magic Packet to wake a machine via LAN.

    Args:
        mac: MAC address in any common format (aa:bb:cc:dd:ee:ff, AA-BB-CC-DD-EE-FF, etc.)
        broadcast: Broadcast address to send to (default: 255.255.255.255)
        port: UDP port (default: 9, also 7 is common)

    Returns:
        True if packet was sent, False if MAC address is invalid.
    """
    mac_hex = re.sub(r"[:\-.]", "", mac).lower()
    if len(mac_hex) != 12 or not all(c in "0123456789abcdef" for c in mac_hex):
        return False

    payload = b"\xff" * 6 + bytes.fromhex(mac_hex) * 16

    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.sendto(payload, (broadcast, port))

    return True
