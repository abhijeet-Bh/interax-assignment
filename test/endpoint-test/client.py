import asyncio
import websockets
import os

async def send_wav_and_receive_flac():
    uri = "ws://localhost:8080/stream"

    chunk_size = 64 * 1024  # 64 KB
    file_path = "./audios/sample.wav"
    
    total_size = os.path.getsize(file_path)
    print(f"Total size of file to send: {total_size} bytes")

    with open(file_path, "rb") as wav_file:
        async with websockets.connect(uri, max_size=4 * 1024 * 1024) as websocket:
            sent_bytes = 0
            
            while True:
                chunk = wav_file.read(chunk_size)
                if not chunk:
                    break
                
                # Retry mechanism
                retries = 3
                while retries > 0:
                    try:
                        await websocket.send(chunk)
                        sent_bytes += len(chunk)
                        print(f"Sent {len(chunk)} bytes, total sent: {sent_bytes}/{total_size} bytes")
                        break  # Break out of the retry loop on successful send
                    except websockets.exceptions.ConnectionClosed as e:
                        print(f"Connection closed with error: {e}")
                        return
                    except websockets.exceptions.PayloadTooBig:
                        print(f"Payload too large, reducing chunk size and retrying...")
                        chunk_size = max(chunk_size // 2, 1024)  # Reduce chunk size, minimum 1 KB
                        chunk = wav_file.read(chunk_size)  # Read the next chunk with new size
                        retries -= 1

                await asyncio.sleep(0.1)  # Delay between sends

            # Optionally send "EOF" to signal end of data transmission
            await websocket.send(b"EOF")

            try:
                # Receive FLAC response
                flac_data = await asyncio.wait_for(websocket.recv(), timeout=10)  # Wait for a response with a timeout
                with open("./audios/recieved.flac", "wb") as flac_file:
                    flac_file.write(flac_data)
            except asyncio.TimeoutError:
                print("Timeout while waiting for server response.")
            except websockets.exceptions.ConnectionClosed as e:
                print(f"Connection closed while waiting for response: {e}")

asyncio.run(send_wav_and_receive_flac())