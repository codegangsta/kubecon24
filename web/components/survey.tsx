"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { z } from "zod";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";

export enum Familiarity {
  None = "I'm a complete newbie",
  Some = "I've heard of it",
  Evaluated = "I've used it before",
  InProduction = "I'm using NATS in production",
}

export enum UseCase {
  EventStreaming = "Event streaming in NATS",
  Microservices = "NATS for microservice architectures",
  IoT = "NATS for IoT, Edge and Fleet management",
}

export enum Industry {
  Finance = "Finance",
  Retail = "Retail",
  Healthcare = "Healthcare",
  Government = "Government",
  Entertainment = "Entertainment",
  Industrial = "Industrial",
  IoT = "IoT",
  Other = "Other",
}

const schema = z.object({
  familiarity: z.nativeEnum(Familiarity),
  use_case: z.nativeEnum(UseCase),
  industry: z.nativeEnum(Industry),
});

export interface SurveyQuestion {
  label: string;
  id: keyof SurveyFormData;
  options: string[];
}

export const SurveyQuestions: SurveyQuestion[] = [
  {
    label: "How familiar are you with the NATS messaging system?",
    id: "familiarity",
    options: Object.values(Familiarity),
  },
  {
    label: "What use cases are you interested in learning more about?",
    id: "use_case",
    options: Object.values(UseCase),
  },
  {
    label: "What industry do you work in?",
    id: "industry",
    options: Object.values(Industry),
  },
];

export type SurveyFormData = z.infer<typeof schema>;

interface Props {
  onSubmit: (data: SurveyFormData) => void;
}

export default function Survey(props: Props) {
  const form = useForm<SurveyFormData>({
    // @ts-ignore Not sure why but this complains about types for no reason
    resolver: zodResolver(schema),
  });

  return (
    <div className="flex flex-grow items-center justify-center">
      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>NATS Survey</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(props.onSubmit)}
              className="space-y-6"
            >
              {SurveyQuestions.map((question) => (
                <FormField
                  key={question.id}
                  name={question.id}
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{question.label}</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-col space-y-1"
                        >
                          {question.options.map((value) => (
                            <FormItem
                              key={value}
                              className="flex items-center space-x-3 space-y-0"
                            >
                              <FormControl>
                                <RadioGroupItem value={value}></RadioGroupItem>
                              </FormControl>
                              <FormLabel className="font-normal">
                                {value}
                              </FormLabel>
                            </FormItem>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <Button type="submit">Get Started</Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
