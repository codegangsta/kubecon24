import { Disc2Icon, EyeIcon, StopCircleIcon, WebcamIcon } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "./ui/dialog";
import Webcam from "react-webcam";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNatsStore } from "./use-nats-store";
import { JSONCodec, StringCodec } from "nats.ws";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";

// TODO:Get this working for other webcam types
const videoConstraints = {
  width: 1280,
  height: 720,
  facingMode: "user",
  framerate: 60,
};

const jc = JSONCodec<DetectionResponse>();
const sc = StringCodec();

interface Point {
  X: number;
  Y: number;
}

interface Detection {
  ClassNames: string[];
  Probabilities: number[];
  StartPoint: Point;
  EndPoint: Point;
}

interface DetectionResponse {
  ModelName: string;
  Threshold: number;
  NetworkOnlyTimeTaken: number;
  OverallTimeTaken: number;
  Detections: Detection[];
}

interface Props {
  observer?: boolean;
}

export default function WebcamDialog({ observer }: Props) {
  const { connection } = useNatsStore();
  const webcamRef = useRef<Webcam>(null);
  const [detections, setDetections] = useState<DetectionResponse>();
  const [imgSrc, setImgSrc] = useState<string>();
  const [streaming, setStreaming] = useState<boolean>(false);

  const applyDetections = useCallback((data: DetectionResponse) => {
    // sort by class name
    data.Detections.sort((a, b) => {
      const aName = a.ClassNames.join("");
      const bName = b.ClassNames.join("");
      return aName.localeCompare(bName);
    });

    data.Detections = data.Detections.reduce((acc, curr) => {
      if (curr.ClassNames.length > 0) {
        acc.push(curr);
      }
      return acc;
    }, [] as Detection[]);

    // if (data.Detections.length == 0) {
    //   return;
    // }

    setDetections(data);
  }, []);

  const performDetection = useCallback(async () => {
    if (webcamRef.current) {
      const screenshotData = webcamRef.current.getScreenshot({
        width: 1280 / 2,
        height: 720 / 2,
      });

      if (connection && screenshotData) {
        // generate a short random alphanumeric string
        const randomString = Math.random().toString(36).substring(2, 15);

        const resp = await connection
          .request("ai_detect", screenshotData, {
            reply: "ai_detect.reply." + randomString,
            noMux: true,
            timeout: 5000,
          })
          .catch((err) => {
            console.log(err);
            stopStreaming();
          });
        if (resp) {
          const data = jc.decode(resp.data);
          applyDetections(data);
        }
      }
    }
  }, [connection, webcamRef, applyDetections]);

  useEffect(() => {
    setDetections(undefined);
  }, [observer]);

  useEffect(() => {
    if (observer) {
      if (connection) {
        const sub = connection.subscribe("ai_detect", {
          callback: (err, msg) => {
            if (err) {
              console.log(err);
              return;
            }
            setImgSrc(sc.decode(msg.data));
          },
        });
        const sub2 = connection.subscribe("ai_detect.reply.>", {
          callback: (err, msg) => {
            if (err) {
              console.log(err);
              return;
            }
            const data = jc.decode(msg.data);
            applyDetections(data);
          },
        });

        return () => {
          sub.unsubscribe();
          sub2.unsubscribe();
        };
      }
      return;
    } else if (streaming) {
      performDetection();
    }
  }, [
    detections,
    observer,
    connection,
    performDetection,
    streaming,
    applyDetections,
  ]);

  useEffect(() => {
    return;
    if (observer) {
      return;
    }

    if (streaming) {
      const interval = setInterval(() => {
        console.log("performing detection", Date.now());
        performDetection();
      }, 1000 / 12);

      return () => {
        clearInterval(interval);
      };
    }
  }, [observer, streaming, performDetection]);

  const startStreaming = () => {
    setStreaming(true);
    setTimeout(() => {
      performDetection();
    }, 200);
  };

  const stopStreaming = () => {
    setStreaming(false);
    setTimeout(() => {
      setDetections(undefined);
    }, 500);
  };

  const { width, height } = { width: 1280 / 2, height: 720 / 2 };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          {observer ? <EyeIcon size={24} /> : <WebcamIcon size={24} />}
        </Button>
      </DialogTrigger>

      <DialogContent className="!min-w-[760px] md:max-w-3xl lg:max-w-5xl justify-center">
        <div className="relative">
          {observer ? (
            <img
              src={imgSrc}
              alt="Loading..."
              style={{ width: width, height: height }}
            ></img>
          ) : (
            <Webcam
              width={width}
              height={height}
              ref={webcamRef}
              audio={false}
              mirrored={true}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.8}
              videoConstraints={videoConstraints}
            />
          )}
          {detections && (
            <span className="absolute bottom-0 right-0 bg-purple-500 text-white font-mono text-sm">
              {detections.ModelName} t={detections.Threshold.toFixed(2)}
            </span>
          )}
          <div
            className="absolute inset-0"
            style={{ width: width, height: height }}
          >
            {detections?.Detections.map((detection, i) => (
              <div
                key={detection.ClassNames.join("") + i}
                className="absolute border-2 rounded border-purple-500 transition-all text-sm font-bold text-purple-500 whitespace-nowrap"
                style={{
                  top: detection.StartPoint.Y,
                  left: detection.StartPoint.X,
                  width: detection.EndPoint.X - detection.StartPoint.X,
                  height: detection.EndPoint.Y - detection.StartPoint.Y,
                  opacity: Math.max(detection.Probabilities[0] / 100, 0.25),
                }}
              >
                <div className="absolute -top-5 -left-0.5 overflow-visible flex flex-row gap-1 bg-purple-500 text-xs font-mono text-white py-0.5 px-1">
                  <span>{detection.ClassNames.join(" ")}</span>
                  <span>
                    {detection.Probabilities.map(
                      (n) => `${n.toFixed(0)}%`
                    ).join(" ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        {!observer && (
          <DialogFooter className="flex flex-row justify-center sm:justify-center">
            <div className="flex items-center space-x-2">
              <Switch
                id="object-detection"
                onCheckedChange={(checked) =>
                  checked ? startStreaming() : stopStreaming()
                }
              />
              <Label htmlFor="object-detection">Object Detection</Label>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
