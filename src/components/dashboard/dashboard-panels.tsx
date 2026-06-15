"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PanelToggle, PanelType } from "./panel-toggle";
import { TopicsGrid } from "./topics-grid";
import { EventsGrid } from "./events-grid";
import { Topic, Event } from "@prisma/client";
// We need to import InterviewGrid. Wait, is it a client component? Yes, probably.
import { InterviewGrid } from "./interview-grid";

interface DashboardPanelsProps {
  topics: Topic[];
  events: Event[];
}

export function DashboardPanels({ topics, events }: DashboardPanelsProps) {
  const [activePanel, setActivePanel] = useState<PanelType>("interviews");

  // Animation variants for the 3D rotating "secret door" effect
  const panelVariants = {
    enter: {
      rotateY: -90,
      opacity: 0,
      scale: 0.95,
    },
    center: {
      rotateY: 0,
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.6,
        type: "spring" as const,
        bounce: 0.1,
      },
    },
    exit: {
      rotateY: 90,
      opacity: 0,
      scale: 0.95,
      transition: {
        duration: 0.4,
      },
    },
  };

  return (
    <div className="flex flex-col w-full">
      <PanelToggle activePanel={activePanel} onChange={setActivePanel} />

      <div style={{ perspective: "2000px" }} className="w-full relative min-h-[600px]">
        <AnimatePresence mode="wait">
          {activePanel === "interviews" && (
            <motion.div
              key="interviews"
              variants={panelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              style={{ transformOrigin: "center center", transformStyle: "preserve-3d", backfaceVisibility: "hidden", WebkitFontSmoothing: "antialiased" }}
              className="absolute inset-0 w-full"
            >
              <InterviewGrid />
            </motion.div>
          )}

          {activePanel === "topics" && (
            <motion.div
              key="topics"
              variants={panelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              style={{ transformOrigin: "center center", transformStyle: "preserve-3d", backfaceVisibility: "hidden", WebkitFontSmoothing: "antialiased" }}
              className="absolute inset-0 w-full"
            >
              <TopicsGrid topics={topics} />
            </motion.div>
          )}

          {activePanel === "events" && (
            <motion.div
              key="events"
              variants={panelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              style={{ transformOrigin: "center center", transformStyle: "preserve-3d", backfaceVisibility: "hidden", WebkitFontSmoothing: "antialiased" }}
              className="absolute inset-0 w-full"
            >
              <EventsGrid events={events} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
