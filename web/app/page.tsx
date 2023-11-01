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
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJlZDI1NTE5LW5rZXkifQ.eyJqdGkiOiJJNVlNNzJZQVJERlVGM0RKUDRWTDY2TURYWENTRlYzVllIUFBGSldLQjRCTFRDNTVNWTVBIiwiaWF0IjoxNjk2MjczNTMzLCJpc3MiOiJBREJRNlhaVVdFNFFZRU9XTE5CUVlDTjJHWUtIMlpYQkxCRE9LWFBZQzRSN1ZLWE5BVUVWU1EyNyIsIm5hbWUiOiJ3ZWIiLCJzdWIiOiJVQjJKUlFLUVZZUVhMSUdGTlNZNE5PS0xaQkJFQzJZUlhUQjRXQUwzR1pYTTJHSE9aWENDRVJFSSIsIm5hdHMiOnsicHViIjp7fSwic3ViIjp7fSwic3VicyI6LTEsImRhdGEiOi0xLCJwYXlsb2FkIjotMSwiYmVhcmVyX3Rva2VuIjp0cnVlLCJpc3N1ZXJfYWNjb3VudCI6IkFBSDNFUFRZRTVBQTJTNlBQTU1HUEVEQTJMWk01WkZPRUY3Mk41WEZORFFJT01UVkhYNEhESkRTIiwidHlwZSI6InVzZXIiLCJ2ZXJzaW9uIjoyfX0.gpX2F3Wl_I4nIcmtciLz3SQvMN-Gq4NwD3NclXYVED3vX6nKDQaYlTVPM2WFfG8KbT7H6jPTL7ScfgDaCdzaAw";

const connectOpts = {
  // servers: "ws://localhost:8080",
  servers: "wss://connect.codegangsta.dev:8080",
  authenticator: jwtAuthenticator(bearerJwt),
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
