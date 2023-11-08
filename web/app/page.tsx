"use client";

import Results from "@/components/results";
import Start, { StartFormData } from "@/components/start";
import Survey, { SurveyFormData } from "@/components/survey";
import { useToast } from "@/components/ui/use-toast";
import { useNatsStore } from "@/components/use-nats-store";
import { getItem, setItem } from "@/components/util";
import { ConnectionOptions, JSONCodec, jwtAuthenticator } from "nats.ws";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

enum Step {
  Connecting,
  Start,
  Survey,
  Results,
}

const bearerJwt =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJlZDI1NTE5LW5rZXkifQ.eyJqdGkiOiIzVk8ySlRTTjZWSU5HU0pHTFdZS0xYWVJGM0xLUkFJTUZDREs3TEFNNjZUUVQ3T1RCNURRIiwiaWF0IjoxNjk5MzEwNzI3LCJpc3MiOiJBQ0MyTllZRFFSWkFBTk5WNkNHNDdYUklBWkxZMlhSTjVNMkpWUkZWUFFZQ083WUU1SU9aSFlSSCIsIm5hbWUiOiJ3ZWIiLCJzdWIiOiJVRFBDVDNIWE5TS0tHNVlUSjRWNVo2UFFRVkJDWEFITVpWVkJURTdBRjdVT1JWVFhZRllKQjJQSSIsIm5hdHMiOnsicHViIjp7fSwic3ViIjp7fSwic3VicyI6LTEsImRhdGEiOi0xLCJwYXlsb2FkIjoxMDQ4NTc2LCJiZWFyZXJfdG9rZW4iOnRydWUsImlzc3Vlcl9hY2NvdW50IjoiQUFEN1RLUkxMTktEV0VCVkxERjRLQVlEU1gzUU9QREQ0TzRDNk40WVlSTTNESk5XTTZMV1dUSkMiLCJ0eXBlIjoidXNlciIsInZlcnNpb24iOjJ9fQ.m0f43YZONR5e-lNQycK8UYzBjYX0XnHktFSTMWug_8WxyrGPamiDRVazvJOnEajtofIq6vgHx4ECvuONkeDRBg";

const connectOpts = {
  servers: "ws://localhost:8080",
  // servers: "wss://connect.ngs.global:443",
  // authenticator: jwtAuthenticator(bearerJwt),
};

export default function Home() {
  const [step, setStep] = useState(Step.Start);
  const [nickname, setNickname] = useState<string | null>(getItem("nickname"));
  const { connection, connect } = useNatsStore();
  const [submitted, setSubmitted] = useState<boolean>(
    getItem("survey") === "true"
  );
  const connectURL = useSearchParams().get("connect");

  const { toast } = useToast();
  const { encode } = JSONCodec();

  useEffect(() => {
    if (nickname) {
      if (!connectURL) {
        connect({ name: nickname, ...connectOpts });
      } else {
        connect({ name: nickname, servers: connectURL });
      }
    }
  }, [connect, nickname, connectURL]);

  useEffect(() => {
    if (submitted) {
      setStep(Step.Results);
    }
  }, [submitted]);

  const onStartSubmit = (data: StartFormData) => {
    setNickname(data.nickname);
    setStep(Step.Survey);
  };

  const onSurveySubmit = (data: SurveyFormData) => {
    if (!connection) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Not connected to NATS",
      });
      return;
    }

    const js = connection.jetstream();
    js.publish("survey.submitted", encode(data))
      .then(() => setStep(Step.Results))
      .catch((err) =>
        toast({
          variant: "destructive",
          title: "NATS Error",
          description: err.message,
        })
      );

    if (nickname) {
      setItem("survey", "true");
      setItem("nickname", nickname);
      setStep(Step.Results);
    }
  };

  return (
    <div className="flex flex-grow items-center justify-center">
      {step === Step.Start && <Start onSubmit={onStartSubmit} />}
      {step === Step.Survey && <Survey onSubmit={onSurveySubmit} />}
      {step === Step.Results && nickname && <Results nickname={nickname} />}
    </div>
  );
}
