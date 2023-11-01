#!/usr/bin/python3.8

import time
import nats
import json
import asyncio
import cv2
import signal
import numpy as np
from detectron2.engine import DefaultPredictor
from detectron2.config import get_cfg
from detectron2.data import MetadataCatalog

image_path = "test.png"
image = cv2.imread(image_path)

# Set up the configuration and default predictor
cfg = get_cfg()
cfg.MODEL.DEVICE = "cpu"
cfg.merge_from_file(
    "../detectron2/configs/COCO-Detection/faster_rcnn_R_50_FPN_3x.yaml")
cfg.MODEL.ROI_HEADS.SCORE_THRESH_TEST = 0.85
cfg.MODEL.WEIGHTS = "detectron2://COCO-Detection/faster_rcnn_R_50_FPN_3x/137849458/model_final_280758.pkl"

predictor = DefaultPredictor(cfg)


async def main():
    nc = await nats.connect("nats://localhost:4222")

    async def handler(msg):
        print("Received a message")

        # parse data as an image
        image_bytes_io = np.frombuffer(msg.data, np.uint8)
        image = cv2.imdecode(image_bytes_io, cv2.IMREAD_COLOR)
        start_time = time.time()
        outputs = predictor(image)
        end_time = time.time()

        duration = end_time - start_time
        print(f"Time taken: {duration:.4f} seconds")
        # Extract predicted classes and bounding boxes
        classes = outputs["instances"].pred_classes.cpu().numpy()
        boxes = outputs["instances"].pred_boxes.tensor.cpu().numpy()

        # Get the class names using MetadataCatalog
        class_names = MetadataCatalog.get(
            cfg.DATASETS.TRAIN[0]).get("thing_classes")

        bbox_details = []
        for i, (cls, box) in enumerate(zip(classes, boxes)):
            x1, y1, x2, y2 = box
            bbox_details.append({
                "bbox_id": i + 1,
                "class_name": class_names[cls],
                "x1": float(x1),
                "y1": float(y1),
                "x2": float(x2),
                "y2": float(y2)
            })

        await nc.publish(msg.reply, json.dumps(bbox_details).encode())

    await nc.subscribe("detect", "detect", cb=handler)

    print("Listening for messages on 'detect' subject...")

    stop_event = asyncio.Event()

    def signal_handler():
        stop_event.set()

    loop = asyncio.get_event_loop()
    loop.add_signal_handler(signal.SIGINT, signal_handler)
    loop.add_signal_handler(signal.SIGTERM, signal_handler)

    await stop_event.wait()

    # Clean up before exit
    await nc.close()

if __name__ == '__main__':
    asyncio.run(main())
