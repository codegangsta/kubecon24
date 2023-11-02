package main

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image/jpeg"
	"log"
	"strings"

	"github.com/LdDl/go-darknet"
	"github.com/nats-io/nats.go/micro"
)

type DetectionResponse struct {
	*darknet.DetectionResult
	ModelName string
	Threshold float64
}

func detectionHandler() micro.Handler {
	return micro.HandlerFunc(func(req micro.Request) {
		Log("Received Detection request")

		imageBytes, err := decodeDataURL(string(req.Data()))
		if err != nil {
			Log("Error decoding image:", err.Error())
			req.Error("400", "Error decoding image", nil)
			return
		}
		buffer := bytes.NewBuffer(imageBytes)
		src, err := jpeg.Decode(buffer)
		if err != nil {
			log.Println("Error decoding image:", err)
			req.Error("400", "Error decoding image", nil)
			return
		}

		// Resize our image
		// src = imaging.Resize(src, 416, 416, imaging.Lanczos)
		imgDarknet, err := darknet.Image2Float32(src)
		if err != nil {
			Log("Error processing image:", err.Error())
			req.Error("500", "Error processing image", nil)
			return
		}
		defer imgDarknet.Close()

		networkLock.RLock()
		defer networkLock.RUnlock()
		dr, err := network.Detect(imgDarknet)
		if err != nil {
			Log("Error performing detection:", err.Error())
			req.Error("500", "Error processing image", nil)
			return
		}

		req.RespondJSON(&DetectionResponse{dr, modelName, threshold})
	})
}

func decodeDataURL(dataURL string) ([]byte, error) {
	// Splitting the Data URL at the comma
	dataParts := strings.SplitN(dataURL, ",", 2)
	if len(dataParts) != 2 {
		return nil, fmt.Errorf("invalid data URL")
	}

	// Decoding the base64 part
	return base64.StdEncoding.DecodeString(dataParts[1])
}
