package main

import (
	"bytes"
	"image/jpeg"
	"log"

	"github.com/LdDl/go-darknet"
	"github.com/nats-io/nats.go/micro"
)

type DetectionResponse struct {
	Detections []*darknet.Detection
}

func detectionHandler(n *darknet.YOLONetwork) micro.Handler {
	return micro.HandlerFunc(func(req micro.Request) {
		log.Println("Received Detection request")

		buffer := bytes.NewBuffer(req.Data())
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
