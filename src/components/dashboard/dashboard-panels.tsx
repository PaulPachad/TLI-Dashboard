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

  const panelVariants = {
    enter: {
      opacity: 0,
      y: 4,
      scale: 0.995,
    },
    center: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.18,
        ease: "easeOut" as const,
      },
    },
    exit: {
      opacity: 0,
      y: -4,
      scale: 0.995,
      transition: {
        duration: 0.14,
        ease: "easeInOut" as const,
      },
    },
  };

  return (
    <div className="flex flex-col w-full">
      <PanelToggle activePanel={activePanel} onChange={setActivePanel} />

      <div className="w-full relative min-h-[600px]">
        <AnimatePresence mode="wait">
          {activePanel === "interviews" && (
            <motion.div
              key="interviews"
              variants={panelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              style={{
                WebkitFontSmoothing: "antialiased",
                willChange: "transform, opacity"
              }}
              className="w-full"
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
              style={{
                WebkitFontSmoothing: "antialiased",
                willChange: "transform, opacity"
              }}
              className="w-full"
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
              style={{
                WebkitFontSmoothing: "antialiased",
                willChange: "transform, opacity"
              }}
              className="w-full"
            >
              <EventsGrid events={events} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
