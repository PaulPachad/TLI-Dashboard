"use client";

import { type ReactNode, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { PanelToggle, PanelType } from "./panel-toggle";
import { TopicsGrid } from "./topics-grid";
import { EventsGrid } from "./events-grid";
import { Topic, Event } from "@prisma/client";
import { InterviewGrid } from "./interview-grid";

interface DashboardPanelsProps {
  topics: Topic[];
  events: Event[];
}

const PANEL_ORDER: PanelType[] = ["interviews", "topics", "events"];

export function DashboardPanels({ topics, events }: DashboardPanelsProps) {
  const [activePanel, setActivePanel] = useState<PanelType>("interviews");
  const [direction, setDirection] = useState(1);
  const reduceMotion = useReducedMotion();

  function handlePanelChange(nextPanel: PanelType) {
    if (nextPanel === activePanel) return;

    const currentIndex = PANEL_ORDER.indexOf(activePanel);
    const nextIndex = PANEL_ORDER.indexOf(nextPanel);
    setDirection(nextIndex > currentIndex ? 1 : -1);
    setActivePanel(nextPanel);
  }

  const panelVariants = reduceMotion
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1, transition: { duration: 0.12 } },
        exit: { opacity: 0, transition: { duration: 0.1 } },
      }
    : {
        enter: (turnDirection: number) => ({
          opacity: 0,
          rotateY: turnDirection * 22,
          x: turnDirection * 18,
          scale: 0.985,
        }),
        center: {
          opacity: 1,
          rotateY: 0,
          x: 0,
          scale: 1,
          transition: {
            rotateY: {
              type: "spring" as const,
              stiffness: 150,
              damping: 24,
              mass: 0.85,
            },
            x: {
              type: "spring" as const,
              stiffness: 170,
              damping: 26,
              mass: 0.8,
            },
            scale: { duration: 0.24, ease: "easeOut" as const },
            opacity: { duration: 0.16, ease: "easeOut" as const },
          },
        },
        exit: (turnDirection: number) => ({
          opacity: 0,
          rotateY: turnDirection * -18,
          x: turnDirection * -14,
          scale: 0.99,
          transition: {
            duration: 0.2,
            ease: [0.4, 0, 0.2, 1] as const,
          },
        }),
      };

  function renderPanel(key: PanelType, children: ReactNode) {
    return (
      <motion.div
        key={key}
        variants={panelVariants}
        custom={direction}
        initial="enter"
        animate="center"
        exit="exit"
        style={{
          transformOrigin: direction > 0 ? "left center" : "right center",
          transformStyle: "preserve-3d",
          backfaceVisibility: "hidden",
          WebkitFontSmoothing: "antialiased",
          willChange: "transform, opacity",
        }}
        className="w-full"
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      <PanelToggle activePanel={activePanel} onChange={handlePanelChange} />

      <div className="relative w-full min-h-[600px] [perspective:1800px]">
        <AnimatePresence mode="wait" custom={direction}>
          {activePanel === "interviews" &&
            renderPanel("interviews", <InterviewGrid />)}

          {activePanel === "topics" &&
            renderPanel("topics", <TopicsGrid topics={topics} />)}

          {activePanel === "events" &&
            renderPanel("events", <EventsGrid events={events} />)}
        </AnimatePresence>
      </div>
    </div>
  );
}
