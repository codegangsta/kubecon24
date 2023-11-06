package main

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"

	darknet "github.com/LdDl/go-darknet"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"github.com/nats-io/nats.go/micro"
)

var nc *nats.Conn
var modelName = "yolov4-tiny"
var threshold = float64(0.5)
var network *darknet.YOLONetwork
var networkLock = &sync.RWMutex{}

func main() {
	ctx := context.Background()
	fmt.Println("Connecting to nats-server...")
	var err error
	nc, err = nats.Connect("nats://connect.ngs.global", nats.UserCredentials("user.creds"), nats.Name("orin_nano"))
	if err != nil {
		log.Fatal(err)
	}

	Log("Connected to nats-server")
	js, err := jetstream.New(nc)
	if err != nil {
		Fatal("Error creating jetstream", err.Error(), "exiting.")
	}

	kv, err := js.KeyValue(ctx, "config")
	if err != nil {
		Fatal("Error getting KeyValue bucket", err.Error(), "exiting.")
	}

	entry, err := kv.Get(ctx, "ai_detect.threshold")
	if err != nil {
		Log(fmt.Sprintf("Threshold not found, using default: %f", threshold))
	} else {
		threshold, err = strconv.ParseFloat(string(entry.Value()), 32)
		if err != nil {
			Fatal("Error parsing threshold config", err.Error(), "exiting.")
		}
	}

	entry, err = kv.Get(ctx, "ai_detect.model_name")
	if err != nil {
		Log(fmt.Sprintf("Model name not found, using default: %s", modelName))
	} else {
		modelName = string(entry.Value())
		if err != nil {
			Fatal("Error parsing model_name config", err.Error(), "exiting.")
		}
	}

	network, err = SetupNetwork(modelName, threshold)
	if err != nil {
		Fatal("Error starting API", err.Error(), "exiting.")
	}
	_, err = micro.AddService(nc, micro.Config{
		Name:        "ai_detect",
		Version:     "0.0.1",
		Description: "Object detection for images using darknet and yolo ",
		Endpoint: &micro.EndpointConfig{
			Subject: "ai_detect",
			Handler: detectionHandler(),
		},
	})
	if err != nil {
		Fatal("Error adding microservice", err.Error(), "exiting.")
	}
	Log("Listening on 'ai_detect'...")

	Log("Watching for config updates on 'configs' keyvalue bucket with subjects 'ai_detect.threshold' and 'ai_detect.model_name'")
	watcher, err := kv.Watch(ctx, "ai_detect.*", jetstream.UpdatesOnly())
	if err != nil {
		Fatal("Error watching KeyValue bucket", err.Error(), "exiting.")
	}

	for {
		select {
		case <-ctx.Done():
			Log("Context cancelled, exiting.")
			return
		case entry := <-watcher.Updates():
			Log("Config update received:", entry.Key())
			switch entry.Key() {
			case "ai_detect.threshold":
				threshold, err = strconv.ParseFloat(string(entry.Value()), 32)
				if err != nil {
					Log("Error parsing threshold config", err.Error(), "try different config values.")
				} else {
					networkLock.Lock()
					network.Threshold = float32(threshold)
					networkLock.Unlock()
				}

			case "ai_detect.model_name":
				modelName = string(entry.Value())
				Log("Model name updated:", modelName)
				network2, err := SetupNetwork(modelName, threshold)
				if err != nil {
					Log("Error starting new network", err.Error(), "try different config values.")
				} else {
					networkLock.Lock()
					network.Close()
					network = network2
					networkLock.Unlock()
					continue
				}
			}
		}
	}
}

func SetupNetwork(modelName string, threshold float64) (*darknet.YOLONetwork, error) {
	configFile := fmt.Sprintf("data/%s.cfg", modelName)
	weightsFile := fmt.Sprintf("data/%s.weights", modelName)
	Log("Loading network...")
	n := darknet.YOLONetwork{
		GPUDeviceIndex:           0,
		NetworkConfigurationFile: configFile,
		WeightsFile:              weightsFile,
		Threshold:                float32(threshold),
	}
	if err := n.Init(); err != nil {
		return nil, err
	}
	return &n, nil
}

func Log(msg ...string) {
	nc.Publish("ai_detect.logs", []byte(strings.Join(msg, " ")))
	log.Println(msg)
}

func Fatal(msg ...string) {
	nc.Publish("ai_detect.logs", []byte(strings.Join(msg, " ")))
	log.Fatalln(msg)
}
