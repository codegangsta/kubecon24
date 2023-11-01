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
  const [imgSrc, SetImgSrc] = useState<string>();
  const [streaming, setStreaming] = useState<boolean>(false);

  const applyDetections = useCallback((data: DetectionResponse) => {
    // sort by probability
    data.Detections.sort((a, b) => {
      const aProb = a.Probabilities.reduce((a, b) => a + b, 0);
      const bProb = b.Probabilities.reduce((a, b) => a + b, 0);
      return bProb - aProb;
    });

    //dedupe based on class names
    data.Detections = data.Detections.reduce((acc, curr) => {
      const found = acc.find((d) => {
        return d.ClassNames.join("") === curr.ClassNames.join("");
      });
      if (!found && curr.ClassNames.length > 0) {
        acc.push(curr);
      }
      return acc;
    }, [] as Detection[]);

    if (data.Detections.length == 0) {
      data.Detections = detections?.Detections ?? [];
    }

    setDetections(data);
    console.log(data);
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

        const resp = await connection.request("ai_detect", screenshotData, {
          reply: "ai_detect_reply." + randomString,
          noMux: true,
          timeout: 5000,
        });
        const data = jc.decode(resp.data);
        applyDetections(data);
      }
    }
  }, [connection, webcamRef, applyDetections]);

  useEffect(() => {
    if (observer) {
      if (connection) {
        const sub = connection.subscribe("ai_detect", {
          callback: (err, msg) => {
            if (err) {
              console.log(err);
              return;
            }
            SetImgSrc(sc.decode(msg.data));
          },
        });
        const sub2 = connection.subscribe("ai_detect_reply.>", {
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

      <DialogContent className="md:max-w-3xl lg:max-w-5xl justify-center">
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
          <div
            className="absolute inset-0"
            style={{ width: width, height: height }}
          >
            {detections?.Detections.map((detection, i) => (
              <div
                key={detection.ClassNames.join("")}
                className="absolute border-4 rounded border-purple-500 transition-all text-sm font-bold text-purple-500 whitespace-nowrap"
                style={{
                  top: detection.StartPoint.Y,
                  left: detection.StartPoint.X,
                  width: detection.EndPoint.X - detection.StartPoint.X,
                  height: detection.EndPoint.Y - detection.StartPoint.Y,
                  opacity: detection.Probabilities[0] / 100,
                }}
              >
                <div className="absolute -top-6 overflow-visible flex flex-row gap-1">
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
        <DialogFooter className="flex flex-row justify-center sm:justify-center">
          <div></div>
          {streaming ? (
            <Button variant="destructive" onClick={() => stopStreaming()}>
              <StopCircleIcon size={24} />
            </Button>
          ) : (
            <Button onClick={() => setStreaming(true)}>
              <Disc2Icon className="text-red-400" size={24} />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
