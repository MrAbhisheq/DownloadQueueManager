#!/usr/bin/env python3
"""
Native messaging host for Download Manager Pro.
Handles OS shutdown command.
Compatible with Chrome, Edge, Brave, Opera, Vivaldi.
"""

import sys
import json
import struct
import subprocess
import platform
import os

def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None
    length = struct.unpack('=I', raw_length)[0]
    if length > 1024 * 1024:  # 1MB safety limit
        return None
    data = sys.stdin.buffer.read(length).decode('utf-8')
    return json.loads(data)

def send_message(obj):
    encoded = json.dumps(obj).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('=I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

def shutdown():
    os_name = platform.system()
    try:
        if os_name == 'Windows':
            subprocess.Popen([
                'shutdown', '/s', '/t', '30', '/c',
                'Download Manager Pro: Shutting down in 30 seconds. Run "shutdown /a" to abort.'
            ])
        elif os_name == 'Darwin':
            subprocess.Popen([
                'osascript', '-e',
                'tell app "System Events" to shut down'
            ])
        else:  # Linux / BSD
            # Try systemctl first, fall back to shutdown
            if os.path.exists('/usr/bin/systemctl'):
                subprocess.Popen(['systemctl', 'poweroff', '--when=+1min'])
            else:
                subprocess.Popen([
                    'shutdown', '-h', '+1',
                    'Download Manager Pro: Shutting down in 1 minute. Run "shutdown -c" to cancel.'
                ])
        return True
    except Exception as e:
        send_message({'status': 'error', 'message': str(e)})
        return False

if __name__ == '__main__':
    msg = read_message()
    if msg and msg.get('command') == 'shutdown':
        if shutdown():
            send_message({'status': 'shutdown_initiated'})
    elif msg and msg.get('command') == 'ping':
        send_message({'status': 'pong', 'platform': platform.system()})
    else:
        send_message({'status': 'unknown_command'})