"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function LogoutButton({ endpoint, redirectTo, label = "로그아웃" }) {
  const router = useRouter();
  async function handleClick() {
    await fetch(endpoint, { method: "POST" });
    router.push(redirectTo);
    router.refresh();
  }
  return (
    <Button variant="ghost" onClick={handleClick} className="text-xs">
      {label}
    </Button>
  );
}
