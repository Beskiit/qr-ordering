"use client";

import { createContext, useContext, useState } from "react";
import type { Branch, Staff } from "@/lib/types";

interface DashboardState {
  staff: Staff;
  branches: Branch[];
  branchId: string | null;
  setBranchId: (id: string) => void;
}

const DashboardContext = createContext<DashboardState | null>(null);

export function DashboardProvider({
  staff,
  branches,
  children,
}: {
  staff: Staff;
  branches: Branch[];
  children: React.ReactNode;
}) {
  // Branch staff are locked to their branch; admins default to the first one.
  const [branchId, setBranchId] = useState<string | null>(
    staff.branch_id ?? branches[0]?.id ?? null
  );

  return (
    <DashboardContext.Provider value={{ staff, branches, branchId, setBranchId }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardState {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used inside DashboardProvider");
  return ctx;
}
