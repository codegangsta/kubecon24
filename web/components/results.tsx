import { useCallback, useEffect, useRef, useState } from "react";
import { SurveyFormData, SurveyQuestion, SurveyQuestions } from "./survey";
import { useNatsStore } from "./use-nats-store";
import { Events, JSONCodec, StringCodec, consumerOpts } from "nats.ws";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import DeviceDetector from "device-detector-js";
import { getItem, isSubset } from "./util";
import { usePathname, useRouter } from "next/navigation";
import { Terminal } from "lucide-react";
import WebcamDialog from "./webcam-dialog";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "./ui/dialog";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });
const { decode } = JSONCodec<SurveyFormData>();

interface Handoff {
  id: string;
  name: string;
}

interface Props {
  nickname: string;
}

export default function Results({ nickname }: Props) {
  const { connection, logs, log, status } = useNatsStore();
  const [rtt, setRtt] = useState<number>();
  const [results, setResults] = useState<SurveyFormData[]>([]);
  const logContainer = useRef<HTMLDivElement>(null);
  const { chart_color } = useNatsStore((state) => state.config);
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = getItem("isAdmin") === "true";
  const [isSharing, setIsSharing] = useState<boolean>(isAdmin);
  const [serviceId, setServiceId] = useState<string>("");
  const [quickDrawReply, setQuickDrawReply] = useState<string | undefined>();

  const startHandoff = useCallback(async () => {
    if (!connection) return;

    const resp = await connection.request("kubecon.any_volunteers", undefined, {
      timeout: 10000,
    });
    connection.publish("kubecon.handoff", resp.data);
    setIsSharing(false);
  }, [connection]);

  const stopHandoff = useCallback(async () => {
    if (!connection) return;
    const { encode } = JSONCodec<Handoff>();

    connection.publish(
      "kubecon.handoff",
      encode({ id: serviceId, name: nickname })
    );
    setIsSharing(true);
  }, [connection, serviceId, nickname]);

  useEffect(() => {
    const { encode } = JSONCodec();
    setRtt(undefined);
    const interval = setInterval(async () => {
      if (connection && status === Events.Reconnect) {
        const rtt = await connection.rtt();
        setRtt(rtt);
        connection.publish(
          `metrics.${connection.info?.server_name}.${connection.info?.client_id}`,
          encode({
            rtt: rtt,
            server: connection.info?.server_name,
            nickname: nickname,
            ...connection.info,
            ...connection.stats(),
          })
        );
      }
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [connection, nickname]);

  useEffect(() => {
    if (logContainer.current) {
      logContainer.current.scrollTop = logContainer.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    setResults([]);
    if (!connection) {
      return;
    }

    log(
      `Connected to ${connection.info?.server_name
      } (${connection.getServer()}) as "${nickname}"`
    );

    const opts = consumerOpts();
    opts.bindStream("survey");
    opts.orderedConsumer();
    const js = connection.jetstream();
    const sub = (async () => {
      const sub = await js.subscribe("survey.submitted", opts);
      for await (const m of sub) {
        setResults((current) => [...current, decode(m.data)]);
      }

      return sub;
    })();

    return () => {
      sub.then((s) => s.unsubscribe());
    };
  }, [connection, nickname, log]);

  useEffect(() => {
    if (!connection) {
      return;
    }

    const sub = connection.subscribe("quickdraw_reply.>", {
      callback: (err, msg) => {
        const { decode } = StringCodec();
        log(`${decode(msg.data)} is the winner!`);
        setQuickDrawReply(undefined);
      },
    });

    return () => {
      sub.unsubscribe();
    };
  }, [connection]);

  useEffect(() => {
    if (!connection) {
      return;
    }
    const { encode } = JSONCodec();

    const service = (async () => {
      const service = await connection.services.add({
        name: "kubecon",
        description: "Attendee Service",
        version: "0.0.1",
        statsHandler: (stats) => {
          return Promise.resolve({
            server: connection.info?.server_name,
          });
        },
      });
      setServiceId(service.info().id);

      service.addEndpoint("device_info", {
        queue: service.info().id,
        subject: "kubecon.device_info",
        metadata: {
          description: "Returns device info with optional filtering.",
        },
        handler: async (err, msg) => {
          log(`Received request on ${msg.subject}`);

          const device = new DeviceDetector().parse(navigator.userAgent);
          const payload = { name: nickname, ...device };

          if (msg.data.length == 0 || isSubset(msg.json(), device)) {
            log(`\tSending response: ${JSON.stringify(payload)}`);
            msg.respond(encode(payload));
          } else {
            log(`\tIgnoring request: Does not match device filter`);
          }
        },
      });

      service.addEndpoint("advertise", {
        queue: service.info().id,
        subject: "kubecon.advertise",
        metadata: {
          description: "Advertise a new server for clients to connect to.",
        },
        handler: async (err, msg) => {
          log(`Received request on ${msg.subject}`);
          const sc = StringCodec();
          const url = sc.decode(msg.data);
          const urlParams = new URLSearchParams(window.location.search);
          if (url.length > 0) {
            urlParams.set("connect", url);
          } else {
            urlParams.delete("connect");
          }
          window.history.pushState(null, "", "?" + urlParams.toString());
          router.replace(`${pathname}?${urlParams}`);
        },
      });

      service.addEndpoint("nickname", {
        subject: "kubecon.nickname",
        metadata: {
          description: "Returns the name of the attendee.",
        },
        handler: async (err, msg) => {
          log(`Received request on ${msg.subject}`);
          const { encode } = StringCodec();
          msg.respond(encode(nickname));
          log(`\tSending response: ${nickname}`);
        },
      });

      service.addEndpoint("quickdraw", {
        queue: service.info().id,
        subject: "kubecon.quickdraw",
        metadata: {
          description: "Pops a dialog for attendees to reply to.",
        },
        handler: async (err, msg) => {
          log(`Received request on ${msg.subject}`);
          setQuickDrawReply(msg.reply);
        },
      });

      service.addEndpoint("any_volunteers", {
        queue: service.info().id,
        subject: "kubecon.any_volunteers",
        metadata: {
          description: "Requests a handoff to another webcam",
        },
        handler: async (err, msg) => {
          if (isAdmin) return;
          const device = new DeviceDetector().parse(navigator.userAgent);
          if (device.device?.type != "desktop") return;

          if (window.confirm("Would you like to share your webcam?")) {
            const { encode } = JSONCodec<Handoff>();
            const handoff = encode({
              id: service.info().id,
              name: nickname,
            });
            msg.respond(handoff);
          }
        },
      });

      service.addEndpoint("handoff", {
        queue: service.info().id,
        subject: "kubecon.handoff",
        metadata: {
          description: "Navigate clients to the voting page",
        },
        handler: async (err, msg) => {
          const { decode } = JSONCodec<Handoff>();
          const handoff = decode(msg.data);
          if (handoff.id == service.info().id) {
            setIsSharing(true);
          } else {
            setIsSharing(false);
          }
          log(
            `Handing off the camera to ${handoff.name}. It's your time to shine!`
          );
        },
      });

      const info = service.info();
      log(`Initialized "${info.name}" service v${info.version}`);

      return service;
    })();

    return () => {
      service.then((s) => s.stop());
    };
  }, [connection, nickname, log, pathname, router]);

  const seriesData = (question: SurveyQuestion) => {
    const d = question.options.map((option) => {
      var n = 0;
      results.forEach((data) => {
        if (data[question.id] == option) {
          n++;
        }
      });
      return n;
    });

    return d;
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="p-3 md:p-6">
          <div className="flex flex-row gap-3">
            <span className="font-medium font-mono flex flex-row gap-3">
              {status === Events.Reconnect && (
                <div className="w-5 h-5 p-2">
                  <span className="w-3 h-3 block bg-green-500 rounded-full"></span>
                </div>
              )}
              {status === Events.Disconnect && (
                <div className="w-5 h-5 p-2">
                  <span className="w-3 h-3 block bg-red-500 rounded-full"></span>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <span>{connection?.info?.server_name}</span>
                <span className="flex flex-row text-sm text-zinc-400 font-mono gap-2">
                  <span>RTT:</span>
                  {rtt != undefined && <span>{rtt}ms</span>}
                </span>
              </div>
            </span>
            <div className="flex-grow flex-1"></div>
            {isAdmin && isSharing && (
              <Button onClick={startHandoff}>Handoff</Button>
            )}
            {isAdmin && !isSharing && (
              <Button onClick={stopHandoff}>Stop Handoff</Button>
            )}
            {isSharing ? <WebcamDialog /> : <WebcamDialog observer />}
          </div>
        </CardHeader>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {SurveyQuestions.map((question) => (
          <Card key={question.id}>
            <CardHeader className="p-3 md:p-6">
              <CardTitle className="line-clamp-2 text-base sm:text-lg lg:text-2xl">
                {question.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <Chart
                className="min-h-[48px]"
                width={"100%"}
                height="auto"
                type="donut"
                options={{
                  labels: question.options,
                  legend: {
                    show: false,
                  },
                  stroke: {
                    show: false,
                  },
                  tooltip: {
                    enabled: false,
                  },
                  plotOptions: {
                    pie: {
                      donut: {
                        size: "75%",
                        labels: {
                          show: true,
                          total: {
                            show: true,
                            color: "#ffffff",
                          },
                          name: {
                            color: "#ffffff",
                          },
                          value: {
                            color: "#ffffff",
                          },
                        },
                      },
                    },
                  },
                  theme: {
                    monochrome: {
                      enabled: true,
                      color: chart_color,
                      shadeTo: "dark",
                      shadeIntensity: 0.85,
                    },
                  },
                }}
                series={seriesData(question)}
              />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="w-full p-3 md:p-6">
          <CardTitle className="text-base sm:text-lg lg:text-2xl flex flex-row gap-3">
            <Terminal className="text-zinc-300 p-0.5" />
            <span>Logs</span>
          </CardTitle>
        </CardHeader>
        <CardContent
          ref={logContainer}
          className="font-mono text-xs md:text-base text-zinc-400 h-72 overflow-y-scroll overflow-x-hidden p-3 pt-0 md:p-6 md:pt-0"
        >
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </CardContent>
      </Card>
      <Dialog
        open={!!quickDrawReply}
        onOpenChange={(open) => {
          if (!open) setQuickDrawReply(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <span className="text-2xl text-center">
              Who wants to win a tshirt?
            </span>
          </DialogHeader>
          <DialogFooter className="flex flex-row lg:justify-center mt-6">
            <Button
              onClick={() =>
                quickDrawReply && connection?.publish(quickDrawReply, nickname)
              }
            >
              Pick Me!
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
