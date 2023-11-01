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
	Detections []*darknet.Detection
}

func detectionHandler(n *darknet.YOLONetwork) micro.Handler {
	return micro.HandlerFunc(func(req micro.Request) {
		log.Println("Received Detection request")

		imageBytes, err := decodeDataURL(string(req.Data()))
		if err != nil {
			log.Println("Error decoding image:", err)
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
			log.Println("Error processing image:", err)
			req.Error("500", "Error processing image", nil)
			return
		}
		defer imgDarknet.Close()

		dr, err := n.Detect(imgDarknet)
		if err != nil {
			log.Println("Error performing detection:", err)
			req.Error("500", "Error processing image", nil)
			return
		}

		req.RespondJSON(dr)
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
