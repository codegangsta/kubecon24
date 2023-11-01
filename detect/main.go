package main

import (
	"flag"
	"fmt"
	"log"
	"runtime"

	darknet "github.com/LdDl/go-darknet"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/micro"
)

var configFile = flag.String("configFile", "",
	"Path to network layer configuration file. Example: cfg/yolov3.cfg")
var weightsFile = flag.String("weightsFile", "",
	"Path to weights file. Example: yolov3.weights")
var imageFile = flag.String("imageFile", "",
	"Path to image file, for detection. Example: image.jpg")

func printError(err error) {
	log.Println("error:", err)
}

func main() {
	flag.Parse()

	if *configFile == "" || *weightsFile == "" ||
		*imageFile == "" {

		flag.Usage()
		return
	}

	n := darknet.YOLONetwork{
		GPUDeviceIndex:           0,
		NetworkConfigurationFile: *configFile,
		WeightsFile:              *weightsFile,
		Threshold:                .85,
	}
	if err := n.Init(); err != nil {
		printError(err)
		return
	}

	fmt.Println("Connecting to nats-server...")
	nc, err := nats.Connect("mac-studio.tail73cc5.ts.net:4222")
	if err != nil {
		log.Fatal(err)
	}

	_, err = micro.AddService(nc, micro.Config{
		Name:        "ai_detect",
		Version:     "0.0.1",
		Description: "",
		Endpoint: &micro.EndpointConfig{
			Subject: "ai_detect",
			Handler: detectionHandler(&n),
		},
	})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Listening on %q...\n", "ai_detect")

	runtime.Goexit()
	n.Close()
}
