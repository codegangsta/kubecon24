import { WebcamIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTrigger } from "./ui/dialog";
import Webcam from "react-webcam";
import { useEffect, useRef } from "react";

// TODO:Get this working for other webcam types
const videoConstraints = {
  width: 1280,
  height: 720,
  facingMode: "user",
  framerate: 60,
};

export default function WebcamDialog() {
  const webcamRef = useRef<Webcam>(null);
  useEffect(() => {
    if (webcamRef.current) {
      const screenshotData = webcamRef.current.getScreenshot({
        width: 720,
        height: 360,
      });

      console.log("took screenshot");
    }
  }, [webcamRef.current]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <WebcamIcon size={24} />
        </Button>
      </DialogTrigger>

      <DialogContent className="md:max-w-3xl lg:max-w-5xl">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={videoConstraints}
        />
      </DialogContent>
    </Dialog>
  );
}
