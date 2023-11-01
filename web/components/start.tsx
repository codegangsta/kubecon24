"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { z } from "zod";

const schema = z.object({
  nickname: z.string().nonempty(),
});

export type StartFormData = z.infer<typeof schema>;

interface Props {
  onSubmit: (data: StartFormData) => void;
}

export default function Start(props: Props) {
  const form = useForm<StartFormData>({
    // @ts-ignore Not sure why but this complains about types for no reason
    resolver: zodResolver(schema),
  });

  return (
    <div className="flex flex-grow items-center justify-center">
      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>NATS QCon 2023 Demo</CardTitle>
          <CardDescription>
            To kick off the demo, let&apos;s start with a nickname
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(props.onSubmit)}
              className="space-y-6"
            >
              <FormField
                name="nickname"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nickname</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                    <FormDescription>
                      Use a pseudonym if you&apos;d prefer your name not be in
                      the talk recording.
                    </FormDescription>
                  </FormItem>
                )}
              />
              <Button type="submit">Get Started</Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
