package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4 * 1024 * 1024, // 4MB read buffer
	WriteBufferSize: 4 * 1024 * 1024, // 4MB write buffer
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func main() {
	router := gin.Default()

	// WebSocket endpoint
	router.GET("/stream", func(c *gin.Context) {
		handleWebSocket(c.Writer, c.Request)
	})

	// Start server
	router.Run(":8080")
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println("Error upgrading to WebSocket:", err)
		return
	}
	defer conn.Close()

	var dataBuffer []byte

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				fmt.Printf("Unexpected close error: %v\n", err)
			}
			break
		}

		// Check if received message is an "EOF" signal
		if string(data) == "EOF" {
			// Process the accumulated WAV data and convert to FLAC
			if err := processAndSendFLAC(conn, dataBuffer); err != nil {
				fmt.Println("Error in processing and sending FLAC:", err)
			}
			break
		}

		// Accumulate data in buffer
		dataBuffer = append(dataBuffer, data...)

		// Optional: Limit the buffer size if needed
		maxBufferSize := 10 * 1024 * 1024 // 10MB limit (adjust as needed)
		if len(dataBuffer) > maxBufferSize {
			fmt.Println("Error: Payload too large")
			conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseMessageTooBig, "Payload too large"))
			return
		}
	}
}

func processAndSendFLAC(conn *websocket.Conn, wavData []byte) error {
	// Create temporary file for WAV data
	tempFile, err := os.CreateTemp("", "input-*.wav")
	if err != nil {
		return fmt.Errorf("Error creating temporary WAV file: %v", err)
	}
	defer tempFile.Close()
	defer os.Remove(tempFile.Name())

	// Write WAV data to the temp file
	if _, err := tempFile.Write(wavData); err != nil {
		return fmt.Errorf("Error writing to WAV file: %v", err)
	}

	// Convert WAV to FLAC
	flacData, err := convertWAVToFLAC(tempFile.Name())
	if err != nil {
		return fmt.Errorf("Error converting WAV to FLAC: %v", err)
	}

	// Send FLAC data back over WebSocket
	err = conn.WriteMessage(websocket.BinaryMessage, flacData)
	if err != nil {
		return fmt.Errorf("Error sending FLAC data: %v", err)
	}

	return nil
}

func convertWAVToFLAC(wavFilePath string) ([]byte, error) {
	cmd := exec.Command("ffmpeg", "-i", wavFilePath, "-f", "flac", "pipe:1")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("Error creating stdout pipe: %v", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("Error starting ffmpeg command: %v", err)
	}

	flacData, err := io.ReadAll(stdout)
	if err != nil {
		return nil, fmt.Errorf("Error reading FLAC data: %v", err)
	}

	if err := cmd.Wait(); err != nil {
		return nil, fmt.Errorf("ffmpeg command error: %v", err)
	}

	return flacData, nil
}
