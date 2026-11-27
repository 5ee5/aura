import type { Metadata } from "next";
import Link from "next/link";
import { WorkoutCard } from "@/components/workout-card";
import { requireSession } from "@/server/auth/dal";
import { getDb } from "@/server/db/client";
import { approvedWorkouts } from "@/server/workouts/store";

export const metadata: Metadata = { title: "Workouts" };

export default async function WorkoutsPage() {
  await requireSession();
  const workouts = await approvedWorkouts(getDb());

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl">Workouts</h1>
      <p className="mt-2 text-muted">
        Workouts you approved, for entering in Garmin Connect. Dated ones come first.
      </p>
      {workouts.length === 0 && (
        <p className="mt-6">
          Nothing approved yet.{" "}
          <Link href="/?c=new" className="text-accent underline underline-offset-4">
            Ask the coach for a workout
          </Link>
          .
        </p>
      )}
      <div className="mt-2">
        {workouts.map((workout) => (
          <WorkoutCard key={workout.id} workout={workout} inList />
        ))}
      </div>
    </div>
  );
}
