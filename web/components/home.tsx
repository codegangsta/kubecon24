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
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJlZDI1NTE5LW5rZXkifQ.eyJqdGkiOiJGMkFMUUNWT09KTVJTUFdVVVdETzZYR0NZWTNHWjVJM1lMTVJMTDRGVk5aRVJPVzVaVEhBIiwiaWF0IjoxNzE2OTM1NTMzLCJpc3MiOiJBQVcyWk9FUlpTWUNQNk5GTVREUFlPN0ZERTY2VE5DS0ZQRE9GWlBaVUc1S1dMWjVTNU01Q1NPUSIsIm5hbWUiOiJkZW1vIiwic3ViIjoiVUJQTFlUSjdSWTNVV00yS0I2NjQ2MkxSQzZXSlQ0NllIQ0Q2V1FFUkhWRUZVVDJUWUZFUlJISU0iLCJuYXRzIjp7InB1YiI6e30sInN1YiI6e30sInN1YnMiOi0xLCJkYXRhIjotMSwicGF5bG9hZCI6LTEsImJlYXJlcl90b2tlbiI6dHJ1ZSwiaXNzdWVyX2FjY291bnQiOiJBQTJMVU5GTkZYRkhGMzVTVlNHT0lKTENEWVdSWUFOSTM3WVBEVkVXV0lOR1RHUExRSElKRjI2TSIsInR5cGUiOiJ1c2VyIiwidmVyc2lvbiI6Mn19.UF3HYmKQVHgItg1GB9CUr_qGm8uZwyWBAcgR1uR3SmvcZPVuGJOZbLvOxDjD-IZFIfisPzb-tc86Npw7mNjkCQ"

const connectOpts = {
  //servers: "ws://localhost:8080",
  servers: "wss://connect.ngs.global:443",
  authenticator: jwtAuthenticator(bearerJwt),
};

export default function Home() {
  const [step, setStep] = useState(Step.Start);
  const [nickname, setNickname] = useState<string | null>(getItem("nickname"));
  const { connection, connect } = useNatsStore();
  const [submitted, setSubmitted] = useState<boolean>(
    getItem("survey") === "true"
  );
  const connectURL = useSearchParams()?.get("connect");

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
