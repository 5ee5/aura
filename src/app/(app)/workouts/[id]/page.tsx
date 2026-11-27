import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkoutCard } from "@/components/workout-card";
import { toDraft } from "@/lib/workout-editor";
import { requireSession } from "@/server/auth/dal";
import { getDb } from "@/server/db/client";
import { getWorkout } from "@/server/workouts/store";
import { Studio } from "./studio";

export const metadata: Metadata = { title: "Edit workout" };

export default async function WorkoutPage({ params }: PageProps<"/workouts/[id]">) {
  await requireSession();
  const { id } = await params;
  const workout = /^[1-9]\d{0,8}$/.test(id) ? await getWorkout(getDb(), Number(id)) : undefined;
  if (!workout) notFound();

  const editable = workout.status === "proposed" || workout.status === "approved";
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/workouts" className="text-sm text-muted underline underline-offset-4">
        All workouts
      </Link>
      <h1 className="mt-2 font-display text-3xl">Edit workout</h1>
      {editable ? (
        <Studio id={workout.id} initial={toDraft(workout)} proposed={workout.status === "proposed"} />
      ) : (
        <>
          <p className="mt-2 text-muted">This workout was declined or replaced, so it can’t be changed.</p>
          <WorkoutCard workout={workout} inList />
        </>
      )}
    </div>
  );
}
