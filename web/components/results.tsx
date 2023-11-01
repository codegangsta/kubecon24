import { useCallback, useEffect, useRef, useState } from "react";
import { SurveyFormData, SurveyQuestion, SurveyQuestions } from "./survey";
import { useNatsStore } from "./use-nats-store";
import { Events, JSONCodec, StringCodec, consumerOpts } from "nats.ws";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import DeviceDetector from "device-detector-js";
import { isSubset } from "./util";
import { usePathname, useRouter } from "next/navigation";
import { Terminal } from "lucide-react";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });
const { decode } = JSONCodec<SurveyFormData>();

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
      `Connected to ${
        connection.info?.server_name
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
    const { encode } = JSONCodec();

    const service = (async () => {
      const service = await connection.services.add({
        name: "qcon",
        description: "QCon Attendee Service",
        version: "0.0.1",
        statsHandler: (stats) => {
          return Promise.resolve({
            server: connection.info?.server_name,
          });
        },
      });

      service.addEndpoint("device_info", {
        queue: service.info().id,
        subject: "qcon.device_info",
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
        subject: "qcon.advertise",
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
        subject: "qcon.nickname",
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

      service.addEndpoint("vote", {
        queue: service.info().id,
        subject: "qcon.vote",
        metadata: {
          description: "Navigate clients to the voting page",
        },
        handler: async (err, msg) => {
          window.location.href =
            "https://qconsf.com/presentation/oct2023/rethinking-connectivity-edge-scaling-fleets-low-powered-devices-using-natsio";
          msg.respond("ok");
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
          <div className="flex flex-row">
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
          </div>
        </CardHeader>
      </Card>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                  theme: {
                    monochrome: {
                      enabled: true,
                      color: chart_color,
                      shadeTo: "dark",
                      shadeIntensity: 0.65,
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
    </div>
  );
}
