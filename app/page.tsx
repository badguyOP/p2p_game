"use client";

import { useEffect, useRef, useState } from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Legend } from "recharts";
import { SCENARIOS, Scenario, Dims, DIMENSION_LABELS, expertOrder, itemName, itemReasoning } from "@/lib/scenarios";
import { errorScore, synergyScore, styleProfile, biasFlags } from "@/lib/insights";
import { loadCustomScenarios, saveCustomScenario, deleteCustomScenario, defaultDims } from "@/lib/customScenarios";
import { loadSessionHistory, saveSessionRecord, clearSessionHistory, SessionRecord } from "@/lib/sessionHistory";

type Player = { name: string; isHost: boolean; isFacilitator?: boolean };
type Phase = "lobby" | "briefing" | "individual" | "teams" | "team" | "reveal";
type TeamReveal = {
  name: string;
  members: string[];
  ranking: number[];
  teamScore: number;
  avgIndividual: number;
  synergy: number;
  teamStyle: Dims;
  flags: string[];
};
type RevealData = {
  scores: { name: string; score: number; team: string }[];
  individualRankings: Record<string, number[]>;
  individualStyles: Record<string, Dims>;
  expertStyle: Dims;
  teams: TeamReveal[];
};
type VoteStatus = { voters: string[]; total: number };
type AssignMethod = "manual" | "auto" | "self";

const ROOM_PREFIX = "boa-";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DIM_KEYS: (keyof Dims)[] = ["speed", "stabilize", "resource", "strategy", "risk"];
const PLAYER_COLORS = ["#6E8CA6", "#B7943C", "#8B6FA0", "#4E8C8A", "#A05C6B", "#6E8C5C"];
const PHONETIC_NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet"];

function genCode(): string {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

function formatTime(totalSec: number): string {
  const sign = totalSec < 0 ? "-" : "";
  const s = Math.abs(totalSec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${sign}${m}:${r.toString().padStart(2, "0")}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deltaColor(delta: number): string {
  const a = Math.abs(delta);
  return a <= 1 ? "#7FA88C" : a <= 3 ? "#C97A3D" : "#B5533A";
}

function genTeamNames(count: number): string[] {
  return PHONETIC_NAMES.slice(0, count);
}

export default function Home() {
  const [role, setRole] = useState<"host" | "peer" | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [cameFromLink, setCameFromLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);

  const [roomCode, setRoomCode] = useState("");
  const [phase, setPhase] = useState<Phase>("lobby");
  const [sessionEnded, setSessionEnded] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [submittedNames, setSubmittedNames] = useState<string[]>([]);
  const [myRanking, setMyRanking] = useState<number[]>([]);
  const [mySubmitted, setMySubmitted] = useState(false);
  const [revealData, setRevealData] = useState<RevealData | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [pickerTrack, setPickerTrack] = useState<"business" | "survival" | "custom">("survival");
  const [showFacilitator, setShowFacilitator] = useState(false);
  const [showIndividualLines, setShowIndividualLines] = useState(false);
  const [expandedReasoningId, setExpandedReasoningId] = useState<number | null>(null);
  const [hostIsFacilitator, setHostIsFacilitator] = useState(false);
  const [selectedTeamView, setSelectedTeamView] = useState<string>("");

  const [teamSize, setTeamSize] = useState(3);
  const [assignMethod, setAssignMethod] = useState<AssignMethod | null>(null);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [playerTeam, setPlayerTeam] = useState<Record<string, string>>({});
  const [teamRankings, setTeamRankings] = useState<Record<string, number[]>>({});

  const [customScenarios, setCustomScenarios] = useState<Scenario[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [bTitle, setBTitle] = useState("");
  const [bSetup, setBSetup] = useState("");
  const [bBriefing, setBBriefing] = useState("");
  const [bMechanicName, setBMechanicName] = useState("");
  const [bMechanicDesc, setBMechanicDesc] = useState("");
  const [bItemName, setBItemName] = useState("");
  const [bItems, setBItems] = useState<{ name: string; dims: Dims }[]>([]);
  const [bExpandedItem, setBExpandedItem] = useState<number | null>(null);

  const [history, setHistory] = useState<SessionRecord[]>([]);

  const [timerMinutes, setTimerMinutes] = useState(5);
  const [phaseEndTime, setPhaseEndTime] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [voteStatus, setVoteStatus] = useState<VoteStatus>({ voters: [], total: 0 });
  const [hasVoted, setHasVoted] = useState(false);
  const votesRef = useRef<Set<string>>(new Set());

  const [browseExpanded, setBrowseExpanded] = useState<string | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const [refTab, setRefTab] = useState<"ranking" | "brief">("ranking");

  const myNameRef = useRef("");
  const phaseRef = useRef<Phase>("lobby");
  const scenarioRef = useRef<Scenario | null>(null);
  const hostRankingsRef = useRef<Record<string, number[]>>({});
  const hostIsFacilitatorRef = useRef(false);
  const teamNamesRef = useRef<string[]>([]);
  const playerTeamRef = useRef<Record<string, string>>({});
  const teamRankingsRef = useRef<Record<string, number[]>>({});
  const peerRef = useRef<any>(null);
  const connsRef = useRef<Map<string, { conn: any; name: string | null }>>(new Map());
  const hostConnRef = useRef<any>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("code");
    if (c) {
      setCodeInput(c.toUpperCase());
      setCameFromLink(true);
    }
    setCustomScenarios(loadCustomScenarios());
    setHistory(loadSessionHistory());
  }, []);

  useEffect(() => {
    if (!phaseEndTime) {
      setRemainingSec(null);
      setTimeUp(false);
      return;
    }
    const tick = () => {
      const rem = Math.round((phaseEndTime - Date.now()) / 1000);
      setRemainingSec(rem);
      if (rem <= 0) setTimeUp(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phaseEndTime]);

  function inviteLink(code: string): string {
    return `${window.location.origin}${window.location.pathname}?code=${code}`;
  }
  function copyText(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function broadcastToAll(msg: any) {
    connsRef.current.forEach(({ conn }) => {
      if (conn.open) conn.send(msg);
    });
  }

  function hostPlayerList(): Player[] {
    const list: Player[] = [{ name: myNameRef.current, isHost: true, isFacilitator: hostIsFacilitatorRef.current }];
    connsRef.current.forEach((v) => {
      if (v.name) list.push({ name: v.name, isHost: false });
    });
    return list;
  }

  function broadcastPlayers() {
    const list = hostPlayerList();
    setPlayers(list);
    broadcastToAll({ type: "players", players: list });
  }

  function toggleFacilitatorMode() {
    const next = !hostIsFacilitatorRef.current;
    hostIsFacilitatorRef.current = next;
    setHostIsFacilitator(next);
    broadcastPlayers();
  }

  function hostHandleMessage(msg: any, conn: any) {
    const entry = connsRef.current.get(conn.peer);
    if (!entry) return;

    if (msg.type === "hello") {
      entry.name = msg.name;
      broadcastPlayers();
      if (scenarioRef.current) conn.send({ type: "scenario", scenario: scenarioRef.current });
      conn.send({ type: "phase", phase: phaseRef.current, endTime: phaseEndTime });
      conn.send({ type: "players", players: hostPlayerList() });
      if (teamNamesRef.current.length) conn.send({ type: "teamsSetup", teamNames: teamNamesRef.current });
      if (Object.keys(playerTeamRef.current).length) conn.send({ type: "assignments", playerTeam: playerTeamRef.current });
      if (Object.keys(teamRankingsRef.current).length) conn.send({ type: "teamState", teamRankings: teamRankingsRef.current });
      conn.send({ type: "individualStatus", names: Object.keys(hostRankingsRef.current) });
      return;
    }
    if (msg.type === "individualSubmit") {
      hostRankingsRef.current[entry.name || ""] = msg.ranking;
      setSubmittedNames(Object.keys(hostRankingsRef.current));
      broadcastToAll({ type: "individualStatus", names: Object.keys(hostRankingsRef.current) });
      return;
    }
    if (msg.type === "joinTeam") {
      const updated = { ...playerTeamRef.current, [entry.name || ""]: msg.teamName };
      playerTeamRef.current = updated;
      setPlayerTeam(updated);
      broadcastToAll({ type: "assignments", playerTeam: updated });
      return;
    }
    if (msg.type === "teamMove") {
      applyTeamMove(msg.teamName, msg.itemId, msg.dir);
      return;
    }
    if (msg.type === "voteAdvance") {
      votesRef.current.add(entry.name || "");
      const total = hostPlayerList().length;
      const voters = Array.from(votesRef.current);
      setVoteStatus({ voters, total });
      broadcastToAll({ type: "voteStatus", voters, total });
      if (voters.length * 2 > total) {
        if (phaseRef.current === "team") hostReveal();
      }
      return;
    }
  }

  function setupHostConnection(conn: any) {
    connsRef.current.set(conn.peer, { conn, name: null });
    conn.on("data", (msg: any) => hostHandleMessage(msg, conn));
    conn.on("close", () => {
      connsRef.current.delete(conn.peer);
      broadcastPlayers();
    });
  }

  async function startHost() {
    if (!nameInput.trim()) return setError("Enter your name first.");
    setError("");
    setBusy(true);
    myNameRef.current = nameInput.trim();

    const { default: Peer } = await import("peerjs");

    const tryCreate = (attempt: number) => {
      const c = genCode();
      const peer = new Peer(ROOM_PREFIX + c);
      peerRef.current = peer;

      peer.on("open", () => {
        setRoomCode(c);
        setRole("host");
        setPlayers([{ name: myNameRef.current, isHost: true }]);
        setBusy(false);
      });
      peer.on("connection", (conn: any) => setupHostConnection(conn));
      peer.on("error", (err: any) => {
        if (err?.type === "unavailable-id" && attempt < 5) {
          peer.destroy();
          tryCreate(attempt + 1);
        } else {
          setBusy(false);
          setError("Couldn't start hosting: " + (err?.message || err?.type || "unknown error"));
        }
      });
    };
    tryCreate(0);
  }

  function hostPickScenario(s: Scenario) {
    scenarioRef.current = s;
    setScenario(s);
    broadcastToAll({ type: "scenario", scenario: s });
  }

  function hostClearScenarioSelection() {
    scenarioRef.current = null;
    setScenario(null);
    broadcastToAll({ type: "scenario", scenario: null });
  }

  function applyTeamMove(teamName: string, itemId: number, dir: number) {
    const r = teamRankingsRef.current[teamName];
    if (!r) return;
    const idx = r.indexOf(itemId);
    const j = idx + dir;
    if (j < 0 || j >= r.length) return;
    const next = [...r];
    [next[idx], next[j]] = [next[j], next[idx]];
    const updated = { ...teamRankingsRef.current, [teamName]: next };
    teamRankingsRef.current = updated;
    setTeamRankings(updated);
    broadcastToAll({ type: "teamState", teamRankings: updated });
  }

  function resetTimerAndVotes(endTime: number | null) {
    setPhaseEndTime(endTime);
    setTimeUp(false);
    setHasVoted(false);
    votesRef.current = new Set();
    setVoteStatus({ voters: [], total: hostPlayerList().length });
  }

  function hostShowBriefing() {
    phaseRef.current = "briefing";
    setPhase("briefing");
    broadcastToAll({ type: "phase", phase: "briefing", endTime: null });
    resetTimerAndVotes(null);
  }

  function hostStartIndividual() {
    const s = scenarioRef.current;
    if (!s) return;
    const endTime = timerMinutes > 0 ? Date.now() + timerMinutes * 60000 : null;
    phaseRef.current = "individual";
    setPhase("individual");
    setMyRanking(shuffle(s.items.map((i) => i.id)));
    setMySubmitted(false);
    hostRankingsRef.current = {};
    setSubmittedNames([]);
    setShowFacilitator(false);
    setRefOpen(false);
    resetTimerAndVotes(endTime);
    broadcastToAll({ type: "phase", phase: "individual", endTime });
  }

  function hostSubmitOwnRanking() {
    hostRankingsRef.current[myNameRef.current] = myRanking;
    setMySubmitted(true);
    const names = Object.keys(hostRankingsRef.current);
    setSubmittedNames(names);
    broadcastToAll({ type: "individualStatus", names });
  }

  function hostGoToTeamSetup() {
    teamNamesRef.current = [];
    setTeamNames([]);
    playerTeamRef.current = {};
    setPlayerTeam({});
    teamRankingsRef.current = {};
    setTeamRankings({});
    setAssignMethod(null);
    phaseRef.current = "teams";
    setPhase("teams");
    resetTimerAndVotes(null);
    broadcastToAll({ type: "phase", phase: "teams", endTime: null });
  }

  function participantNames(): string[] {
    return players.filter((p) => !(p.isHost && hostIsFacilitator)).map((p) => p.name);
  }

  function hostChooseMethod(method: AssignMethod) {
    setAssignMethod(method);
    const count = Math.max(1, Math.round(participantNames().length / teamSize));
    const names = genTeamNames(count);
    teamNamesRef.current = names;
    setTeamNames(names);
    broadcastToAll({ type: "teamsSetup", teamNames: names });
  }

  function hostAutoAssign() {
    const names = teamNamesRef.current;
    if (!names.length) return;
    const shuffled = shuffle(participantNames());
    const assignment: Record<string, string> = {};
    shuffled.forEach((name, i) => {
      assignment[name] = names[i % names.length];
    });
    playerTeamRef.current = assignment;
    setPlayerTeam(assignment);
    broadcastToAll({ type: "assignments", playerTeam: assignment });
  }

  function hostManualAssign(name: string, teamName: string) {
    const updated = { ...playerTeamRef.current, [name]: teamName };
    playerTeamRef.current = updated;
    setPlayerTeam(updated);
    broadcastToAll({ type: "assignments", playerTeam: updated });
  }

  function hostUnassign(name: string) {
    const updated = { ...playerTeamRef.current };
    delete updated[name];
    playerTeamRef.current = updated;
    setPlayerTeam(updated);
    broadcastToAll({ type: "assignments", playerTeam: updated });
  }

  function hostStartTeamPhase() {
    const s = scenarioRef.current;
    if (!s) return;
    const initial: Record<string, number[]> = {};
    teamNamesRef.current.forEach((tn) => {
      const members = Object.entries(playerTeamRef.current).filter(([, t]) => t === tn).map(([n]) => n);
      const memberRanking = members.map((m) => hostRankingsRef.current[m]).find((r) => r && r.length > 0);
      initial[tn] = memberRanking ? [...memberRanking] : s.items.map((i) => i.id);
    });
    teamRankingsRef.current = initial;
    setTeamRankings(initial);
    const endTime = timerMinutes > 0 ? Date.now() + timerMinutes * 60000 : null;
    phaseRef.current = "team";
    setPhase("team");
    resetTimerAndVotes(endTime);
    broadcastToAll({ type: "phase", phase: "team", endTime });
    broadcastToAll({ type: "teamState", teamRankings: initial });
  }

  function hostReveal() {
    const s = scenarioRef.current;
    if (!s) return;
    const expertIds = expertOrder(s);
    const expertStyle = styleProfile(expertIds, s.items);

    const scores = Object.entries(hostRankingsRef.current).map(([name, r]) => ({
      name,
      score: errorScore(r, expertIds),
      team: playerTeamRef.current[name] || "",
    }));
    const individualStyles: Record<string, Dims> = {};
    Object.entries(hostRankingsRef.current).forEach(([name, r]) => {
      individualStyles[name] = styleProfile(r, s.items);
    });

    const teams: TeamReveal[] = teamNamesRef.current.map((tn) => {
      const members = Object.entries(playerTeamRef.current).filter(([, t]) => t === tn).map(([n]) => n);
      const memberScores = scores.filter((sc) => members.includes(sc.name));
      const avgIndividual = memberScores.length ? memberScores.reduce((a, b) => a + b.score, 0) / memberScores.length : 0;
      const ranking = teamRankingsRef.current[tn] || s.items.map((i) => i.id);
      const teamScore = errorScore(ranking, expertIds);
      const synergy = synergyScore(avgIndividual, teamScore);
      const teamStyle = styleProfile(ranking, s.items);
      const memberRankings: Record<string, number[]> = {};
      members.forEach((m) => { if (hostRankingsRef.current[m]) memberRankings[m] = hostRankingsRef.current[m]; });
      const flags = biasFlags({ individualRankings: memberRankings, teamRanking: ranking, expertOrderIds: expertIds, items: s.items });
      return { name: tn, members, ranking, teamScore, avgIndividual, synergy, teamStyle, flags };
    });

    const individualRankings = { ...hostRankingsRef.current };
    const payload: RevealData = { scores, individualRankings, individualStyles, expertStyle, teams };
    setRevealData(payload);
    const myTeam = playerTeamRef.current[myNameRef.current];
    setSelectedTeamView(myTeam || teams[0]?.name || "");
    phaseRef.current = "reveal";
    setPhase("reveal");
    resetTimerAndVotes(null);
    broadcastToAll({ type: "reveal", payload });

    teams.forEach((t) => {
      const record: SessionRecord = {
        id: `${Date.now()}-${t.name}`,
        scenarioTitle: `${s.title} (${t.name})`,
        scenarioId: s.id,
        date: new Date().toISOString(),
        playerCount: t.members.length,
        teamScore: t.teamScore,
        avgIndividual: t.avgIndividual,
        synergy: t.synergy,
      };
      saveSessionRecord(record);
    });
    setHistory(loadSessionHistory());
  }

  function hostChangeScenario() {
    hostRankingsRef.current = {};
    setSubmittedNames([]);
    teamNamesRef.current = [];
    setTeamNames([]);
    playerTeamRef.current = {};
    setPlayerTeam({});
    teamRankingsRef.current = {};
    setTeamRankings({});
    setAssignMethod(null);
    setMySubmitted(false);
    setRevealData(null);
    setExpandedReasoningId(null);
    setShowIndividualLines(false);
    scenarioRef.current = null;
    setScenario(null);
    phaseRef.current = "lobby";
    setPhase("lobby");
    resetTimerAndVotes(null);
    broadcastToAll({ type: "resetToLobby" });
  }

  function hostEndSession() {
    broadcastToAll({ type: "sessionEnded" });
    setSessionEnded(true);
  }

  function peerVoteAdvance() {
    hostConnRef.current?.send({ type: "voteAdvance" });
    setHasVoted(true);
  }

  function addBuilderItem() {
    if (!bItemName.trim()) return;
    setBItems([...bItems, { name: bItemName.trim(), dims: defaultDims() }]);
    setBItemName("");
  }
  function moveBuilderItem(idx: number, dir: number) {
    const j = idx + dir;
    if (j < 0 || j >= bItems.length) return;
    const next = [...bItems];
    [next[idx], next[j]] = [next[j], next[idx]];
    setBItems(next);
  }
  function removeBuilderItem(idx: number) {
    setBItems(bItems.filter((_, i) => i !== idx));
    if (bExpandedItem === idx) setBExpandedItem(null);
  }
  function updateBuilderItemDim(idx: number, key: keyof Dims, value: number) {
    const next = [...bItems];
    next[idx] = { ...next[idx], dims: { ...next[idx].dims, [key]: value } };
    setBItems(next);
  }
  function saveBuilder() {
    if (!bTitle.trim()) return setError("Give the scenario a title.");
    if (bItems.length < 3) return setError("Add at least 3 items, ordered best to worst.");
    setError("");
    const newScenario: Scenario = {
      id: `custom-${Date.now()}`,
      track: "custom",
      title: bTitle.trim(),
      setup: bSetup.trim() || bTitle.trim(),
      briefing: bBriefing.trim() || bSetup.trim() || bTitle.trim(),
      mechanicName: bMechanicName.trim() || "Custom scenario",
      mechanicDesc: bMechanicDesc.trim() || "A scenario built for this group.",
      items: bItems.map((it, idx) => ({ id: idx, name: it.name, rank: idx + 1, dims: it.dims, reasoning: "" })),
    };
    setCustomScenarios(saveCustomScenario(newScenario));
    setBTitle(""); setBSetup(""); setBBriefing(""); setBMechanicName(""); setBMechanicDesc(""); setBItems([]);
    setShowBuilder(false);
    setPickerTrack("custom");
  }
  function removeCustomScenario(id: string) {
    setCustomScenarios(deleteCustomScenario(id));
  }

  function peerHandleMessage(msg: any) {
    if (msg.type === "scenario") {
      scenarioRef.current = msg.scenario;
      setScenario(msg.scenario);
    } else if (msg.type === "phase") {
      setPhase(msg.phase);
      setPhaseEndTime(msg.endTime ?? null);
      setTimeUp(false);
      setHasVoted(false);
      setVoteStatus({ voters: [], total: 0 });
      setRefOpen(false);
      if (msg.phase === "individual" && scenarioRef.current) {
        setMyRanking(shuffle(scenarioRef.current.items.map((i) => i.id)));
        setMySubmitted(false);
      }
    } else if (msg.type === "players") {
      setPlayers(msg.players);
    } else if (msg.type === "individualStatus") {
      setSubmittedNames(msg.names);
    } else if (msg.type === "teamsSetup") {
      teamNamesRef.current = msg.teamNames;
      setTeamNames(msg.teamNames);
    } else if (msg.type === "assignments") {
      playerTeamRef.current = msg.playerTeam;
      setPlayerTeam(msg.playerTeam);
    } else if (msg.type === "teamState") {
      teamRankingsRef.current = msg.teamRankings;
      setTeamRankings(msg.teamRankings);
    } else if (msg.type === "voteStatus") {
      setVoteStatus({ voters: msg.voters, total: msg.total });
    } else if (msg.type === "reveal") {
      setRevealData(msg.payload);
      const myTeam = playerTeamRef.current[myNameRef.current];
      setSelectedTeamView(myTeam || msg.payload.teams[0]?.name || "");
      setPhase("reveal");
    } else if (msg.type === "resetToLobby") {
      scenarioRef.current = null;
      setScenario(null);
      setPhase("lobby");
      teamNamesRef.current = [];
      setTeamNames([]);
      playerTeamRef.current = {};
      setPlayerTeam({});
      teamRankingsRef.current = {};
      setTeamRankings({});
      setSubmittedNames([]);
      setMySubmitted(false);
      setRevealData(null);
      setExpandedReasoningId(null);
      setShowIndividualLines(false);
    } else if (msg.type === "sessionEnded") {
      setSessionEnded(true);
    }
  }

  async function startJoin(codeToJoin: string) {
    if (!nameInput.trim()) return setError("Enter your name first.");
    if (!codeToJoin.trim()) return setError("Enter the room code.");
    setError("");
    setBusy(true);
    myNameRef.current = nameInput.trim();

    const { default: Peer } = await import("peerjs");
    const peer = new Peer();
    peerRef.current = peer;

    peer.on("open", () => {
      const conn = peer.connect(ROOM_PREFIX + codeToJoin.trim().toUpperCase());
      hostConnRef.current = conn;

      conn.on("open", () => {
        conn.send({ type: "hello", name: myNameRef.current });
        setRole("peer");
        setBusy(false);
        setConnectionLost(false);
      });
      conn.on("data", (msg: any) => peerHandleMessage(msg));
      conn.on("close", () => setConnectionLost(true));
      conn.on("error", () => {
        setBusy(false);
        setConnectionLost(true);
        setError("Couldn't reach that room. Double-check the code.");
      });
    });

    peer.on("error", (err: any) => {
      setBusy(false);
      setError(err?.type === "peer-unavailable" ? "Room not found. Double-check the code." : "Connection error.");
    });
  }

  function peerJoinTeam(teamName: string) {
    hostConnRef.current?.send({ type: "joinTeam", teamName });
  }
  function peerSendTeamMove(teamName: string, itemId: number, dir: number) {
    hostConnRef.current?.send({ type: "teamMove", teamName, itemId, dir });
  }
  function peerSubmitRanking() {
    hostConnRef.current?.send({ type: "individualSubmit", ranking: myRanking });
    setMySubmitted(true);
  }

  function moveLocal(pos: number, dir: number) {
    const j = pos + dir;
    if (j < 0 || j >= myRanking.length) return;
    const next = [...myRanking];
    [next[pos], next[j]] = [next[j], next[pos]];
    setMyRanking(next);
  }

  function referencePanel() {
    if (!scenario) return null;
    return (
      <div style={{ marginBottom: 18 }}>
        <button className="secondary" onClick={() => setRefOpen(!refOpen)}>
          {refOpen ? "Hide my ranking & the brief" : "My ranking & the brief"}
        </button>
        {refOpen && (
          <div className="scenario-picked">
            <div className="tabs" style={{ marginBottom: 12 }}>
              <button className={refTab === "ranking" ? "" : "inactive"} onClick={() => setRefTab("ranking")}>My ranking</button>
              <button className={refTab === "brief" ? "" : "inactive"} onClick={() => setRefTab("brief")}>The brief</button>
            </div>
            {refTab === "ranking" ? (
              myRanking.length > 0 ? (
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: "var(--ink)" }}>
                  {myRanking.map((id) => <li key={id}>{itemName(scenario, id)}</li>)}
                </ol>
              ) : (
                <p className="note">You haven't ranked anything yet this round.</p>
              )
            ) : (
              <>
                <p className="sub" style={{ marginBottom: 10 }}>{scenario.briefing}</p>
                <p className="note" style={{ marginBottom: 4 }}>What you have:</p>
                <p className="note">{scenario.items.map((i) => i.name).join(", ")}</p>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  async function exportPdf() {
    if (!scenario || !revealData) return;
    const team = revealData.teams.find((t) => t.name === selectedTeamView);
    if (!team) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const left = 14;
    let y = 20;

    doc.setFontSize(18);
    doc.text(`${scenario.title} — ${team.name}`, left, y);
    y += 10;
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(new Date().toLocaleDateString(), left, y);
    doc.setTextColor(0);
    y += 10;

    doc.setFontSize(13);
    doc.text("Scores", left, y);
    y += 7;
    doc.setFontSize(11);
    revealData.scores.filter((s) => team.members.includes(s.name)).forEach((s) => {
      doc.text(`${s.name}: ${s.score}`, left + 2, y);
      y += 6;
    });
    y += 2;
    doc.text(`Average individual: ${team.avgIndividual.toFixed(1)}`, left + 2, y); y += 6;
    doc.text(`Team: ${team.teamScore}`, left + 2, y); y += 6;
    doc.setFont("helvetica", "bold");
    doc.text(`Synergy score: ${team.synergy > 0 ? "+" : ""}${team.synergy.toFixed(1)}`, left + 2, y);
    doc.setFont("helvetica", "normal");
    y += 12;

    doc.setFontSize(13);
    doc.text("Team ranking vs. expert order", left, y);
    y += 7;
    doc.setFontSize(10);
    const expertIds = expertOrder(scenario);
    team.ranking.forEach((itemId, pos) => {
      const expertPos = expertIds.indexOf(itemId);
      const delta = pos - expertPos;
      const label = delta === 0 ? "exact" : delta > 0 ? `+${delta}` : `${delta}`;
      doc.text(`${pos + 1}. ${itemName(scenario, itemId)}  (${label})`, left + 2, y);
      y += 6;
      if (y > 275) { doc.addPage(); y = 20; }
    });
    y += 6;

    if (team.flags.length) {
      doc.setFontSize(13);
      doc.text("Patterns worth noticing", left, y);
      y += 7;
      doc.setFontSize(10);
      team.flags.forEach((f) => {
        const lines = doc.splitTextToSize(f, 180);
        if (y + lines.length * 5 > 280) { doc.addPage(); y = 20; }
        doc.text(lines, left + 2, y);
        y += lines.length * 5 + 3;
      });
    }

    doc.save(`${scenario.title.toLowerCase().replace(/\s+/g, "-")}-${team.name.toLowerCase().replace(/\s+/g, "-")}-summary.pdf`);
  }

  function timerWidget() {
    if (remainingSec === null) return null;
    return (
      <>
        <div className={`timer-display ${timeUp ? "up" : ""}`}>{timeUp ? "Time's up" : formatTime(remainingSec)}</div>
        {timeUp && (
          <div className="vote-box">
            {role === "host" ? (
              <p>Time's up. Use the button below to advance, or wait for a player majority vote.</p>
            ) : (
              <>
                <p>Time's up — {voteStatus.voters.length} of {voteStatus.total} have voted to move on.</p>
                <button className="secondary" disabled={hasVoted} onClick={peerVoteAdvance}>
                  {hasVoted ? "Vote cast" : "Vote to move on"}
                </button>
              </>
            )}
          </div>
        )}
      </>
    );
  }

  if (role === null) {
    if (cameFromLink) {
      return (
        <div className="wrap">
          <h1>You're invited to a game</h1>
          <p className="sub">
            You'll read a short briefing, then rank a list of priorities on your own — no talking yet. Once
            everyone's done, you'll join a team and re-rank together, then see how your choices compared to
            an expert answer. Takes about 10–15 minutes.
          </p>
          <input placeholder="Your name" value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
          <button disabled={busy} onClick={() => startJoin(codeInput)}>
            {busy ? "Connecting..." : "Join"}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      );
    }

    if (showHistory) {
      return (
        <div className="wrap">
          <h2>Session history on this device</h2>
          <p className="sub">Stored only in this browser — there's no login, so this list won't follow you to another device.</p>
          {history.length === 0 && <p className="note">No sessions played on this device yet.</p>}
          {history.slice().reverse().map((h) => (
            <div className="history-row" key={h.id}>
              <span>
                {h.scenarioTitle}
                <br />
                <span className="meta">{new Date(h.date).toLocaleDateString()} · {h.playerCount} players</span>
              </span>
              <span style={{ color: h.synergy > 0 ? "#7FA88C" : "#B5533A" }}>
                {h.synergy > 0 ? "+" : ""}{h.synergy.toFixed(1)}
              </span>
            </div>
          ))}
          {history.length > 0 && (
            <button className="secondary" style={{ marginTop: 16 }} onClick={() => { clearSessionHistory(); setHistory([]); }}>
              Clear history
            </button>
          )}
          <button style={{ marginTop: 8 }} onClick={() => setShowHistory(false)}>Back</button>
        </div>
      );
    }

    return (
      <div className="wrap">
        <h1>Team Prioritization Games</h1>
        <p className="sub">A game about how people make decisions — alone, and together.</p>
        <input placeholder="Your name" value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
        <button disabled={busy} onClick={startHost}>{busy ? "Starting..." : "Host a game"}</button>
        <div style={{ height: 16 }} />
        <input placeholder="6-digit room code" value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())} />
        <button className="secondary" disabled={busy} onClick={() => startJoin(codeInput)}>
          {busy ? "Connecting..." : "Join a game"}
        </button>
        {error && <p className="error">{error}</p>}
        <button className="secondary" style={{ marginTop: 16 }} onClick={() => setShowHistory(true)}>
          View my session history
        </button>
      </div>
    );
  }

  if (role === "peer" && connectionLost) {
    return (
      <div className="wrap">
        <h2>Connection lost</h2>
        <p className="sub">
          You've been disconnected from the host — this usually happens if your phone locked or the browser
          tab was backgrounded.
        </p>
        <button onClick={() => startJoin(codeInput)}>Try reconnecting</button>
        <p className="note">Uses the same name and room code you joined with.</p>
      </div>
    );
  }

  if (sessionEnded) {
    return (
      <div className="wrap ending-wrap">
        <span className="stamp">Session closed</span>
        <h1>Session complete</h1>
        <p className="sub">Thanks for playing{scenario ? ` — ${scenario.title}` : ""}.</p>
        <p className="note">The host has ended this session. Close this page whenever you're ready.</p>
      </div>
    );
  }

  if (phase === "lobby") {
    if (role === "host" && !scenario) {
      if (showBuilder) {
        return (
          <div className="wrap">
            <h2>Build a custom scenario</h2>
            <p className="sub">Saved only on this device. Add items in order, best to worst — that order becomes the expert answer.</p>
            <input placeholder="Title" value={bTitle} onChange={(e) => setBTitle(e.target.value)} />
            <textarea placeholder="One-line setup (shown in the picker)" value={bSetup} onChange={(e) => setBSetup(e.target.value)} />
            <textarea placeholder="Full briefing passage (shown before ranking starts)" value={bBriefing} onChange={(e) => setBBriefing(e.target.value)} />
            <input placeholder="Mechanic name (optional)" value={bMechanicName} onChange={(e) => setBMechanicName(e.target.value)} />
            <textarea placeholder="Mechanic description (optional)" value={bMechanicDesc} onChange={(e) => setBMechanicDesc(e.target.value)} />
            <p className="section-label">Items, best to worst</p>
            {bItems.map((it, idx) => (
              <div key={idx}>
                <div className="item-chip">
                  <span>{idx + 1}. {it.name}</span>
                  <span style={{ display: "flex", gap: 4 }}>
                    <button className="remove-btn" onClick={() => moveBuilderItem(idx, -1)}>▲</button>
                    <button className="remove-btn" onClick={() => moveBuilderItem(idx, 1)}>▼</button>
                    <button className="remove-btn" onClick={() => setBExpandedItem(bExpandedItem === idx ? null : idx)}>tune</button>
                    <button className="remove-btn" onClick={() => removeBuilderItem(idx)}>x</button>
                  </span>
                </div>
                {bExpandedItem === idx && (
                  <div style={{ padding: "8px 10px", background: "var(--bg)", marginBottom: 6 }}>
                    {DIM_KEYS.map((k) => (
                      <div className="dim-row" key={k}>
                        <span className="label">{DIMENSION_LABELS[k]}</span>
                        <input type="range" min={0} max={1} step={0.1} value={it.dims[k]}
                          onChange={(e) => updateBuilderItemDim(idx, k, parseFloat(e.target.value))} />
                        <span className="val">{it.dims[k].toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <input placeholder="Add an item" value={bItemName} onChange={(e) => setBItemName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addBuilderItem(); }} />
            <button className="secondary" onClick={addBuilderItem}>Add item</button>
            {error && <p className="error">{error}</p>}
            <button style={{ marginTop: 14 }} onClick={saveBuilder}>Save scenario</button>
            <button className="secondary" onClick={() => setShowBuilder(false)}>Cancel</button>
          </div>
        );
      }

      const list = pickerTrack === "custom" ? customScenarios : SCENARIOS.filter((s) => s.track === pickerTrack);
      return (
        <div className="wrap">
          <h2>Choose a scenario</h2>
          <div className="tabs">
            <button className={pickerTrack === "business" ? "" : "inactive"} onClick={() => setPickerTrack("business")}>Business</button>
            <button className={pickerTrack === "survival" ? "" : "inactive"} onClick={() => setPickerTrack("survival")}>Casual</button>
            <button className={pickerTrack === "custom" ? "" : "inactive"} onClick={() => setPickerTrack("custom")}>Custom</button>
          </div>
          {pickerTrack === "custom" && (
            <button className="secondary" onClick={() => setShowBuilder(true)}>+ Create custom scenario</button>
          )}
          {pickerTrack === "custom" && list.length === 0 && <p className="note">No custom scenarios on this device yet.</p>}
          {list.map((s) => (
            <div className="scenario-row" key={s.id}>
              <div onClick={() => hostPickScenario(s)}>
                <div className="title">{s.title}</div>
                <div className="mechanic">{s.mechanicName}</div>
              </div>
              {pickerTrack === "custom" && (
                <button className="remove-btn" style={{ marginTop: 6 }} onClick={() => removeCustomScenario(s.id)}>Delete</button>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (role === "peer" && !scenario) {
      const list = SCENARIOS.filter((s) => s.track === (pickerTrack === "custom" ? "business" : pickerTrack));
      return (
        <div className="wrap">
          <h2>Waiting for the host</h2>
          <p className="sub">Browse what might come up while you wait.</p>
          <div className="tabs">
            <button className={pickerTrack === "business" ? "" : "inactive"} onClick={() => setPickerTrack("business")}>Business</button>
            <button className={pickerTrack === "survival" ? "" : "inactive"} onClick={() => setPickerTrack("survival")}>Casual</button>
          </div>
          {list.map((s) => (
            <div key={s.id}>
              <div className="browse-row" onClick={() => setBrowseExpanded(browseExpanded === s.id ? null : s.id)}>
                <span className="title">{s.title}</span>
              </div>
              {browseExpanded === s.id && <div className="browse-detail">{s.setup}</div>}
            </div>
          ))}
          <p className="note" style={{ marginTop: 12 }}>
            The host might also play a custom scenario built just for this group — those only appear once picked.
          </p>
        </div>
      );
    }

    const minPlayers = hostIsFacilitator ? 3 : 2;

    return (
      <div className="wrap">
        <h2>Lobby</h2>
        {scenario && (
          <div className="scenario-picked">
            <div style={{ color: "var(--accent)", fontFamily: "Georgia, serif" }}>{scenario.title}</div>
            <div className="note">{scenario.mechanicName}</div>
          </div>
        )}
        {role === "host" ? (
          <>
            <p className="sub">Share this code, or the link below, with your players.</p>
            <div className="code-badge">{roomCode}</div>
            <button className="secondary" onClick={() => copyText(inviteLink(roomCode))}>Copy invite link</button>
            <p className="section-label">Round timer</p>
            <input type="number" min={0} value={timerMinutes} onChange={(e) => setTimerMinutes(Math.max(0, parseInt(e.target.value) || 0))} />
            <p className="note" style={{ marginBottom: 16 }}>Minutes per ranking phase. 0 turns the timer off.</p>
            <button className="secondary" onClick={toggleFacilitatorMode}>
              {hostIsFacilitator ? "✓ Facilitator mode" : "Facilitator mode"}
            </button>
            <p className="note" style={{ marginBottom: 16 }}>
              {hostIsFacilitator
                ? "On: you'll run the session and watch rankings, but won't submit one yourself."
                : "Off: turn this on if you're running the session without playing yourself."}
            </p>
          </>
        ) : (
          <p className="sub">Connected. Waiting for the host to start...</p>
        )}
        {players.map((p) => (
          <div className="player-row" key={p.name}>
            <span>{p.name}{p.isHost ? (p.isFacilitator ? " (facilitating)" : " (host)") : ""}</span>
          </div>
        ))}
        {role === "host" && (
          <>
            <button style={{ marginTop: 16 }} disabled={players.length < minPlayers} onClick={hostGoToTeamSetup}>Set up teams</button>
            <button className="secondary" onClick={hostClearScenarioSelection}>Change scenario</button>
            {players.length < minPlayers && (
              <p className="note">
                {hostIsFacilitator ? "Add at least 2 players besides yourself first." : "Add at least one more player first."}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  if (!scenario) {
    return <div className="wrap"><p className="sub">Waiting for the host to pick a scenario...</p></div>;
  }

  if (phase === "briefing") {
    return (
      <div className="wrap">
        <h1>{scenario.title}</h1>
        <p className="sub">{scenario.briefing}</p>
        <p className="section-label">What you have</p>
        <div className="scenario-picked" style={{ padding: 0 }}>
          {scenario.items.map((item) => (
            <div className="player-row" key={item.id} style={{ padding: "10px 14px" }}><span>{item.name}</span></div>
          ))}
        </div>
        <p className="section-label">What makes this one different</p>
        <div className="scenario-picked">
          <div style={{ color: "var(--accent)", fontFamily: "Georgia, serif" }}>{scenario.mechanicName}</div>
          <div className="note">{scenario.mechanicDesc}</div>
        </div>
        {role === "host" ? (
          <button onClick={hostStartIndividual}>Start individual ranking</button>
        ) : (
          <p className="sub">Waiting for the host to start ranking...</p>
        )}
      </div>
    );
  }

  if (phase === "individual") {
    const participantCount = hostIsFacilitator ? players.length - 1 : players.length;

    const facilitatorPanel = role === "host" && (
      <div className="facilitator-panel">
        <button className="secondary" style={{ marginBottom: showFacilitator ? 10 : 0 }} onClick={() => setShowFacilitator(!showFacilitator)}>
          {showFacilitator ? "Hide" : "Show"} live rankings (facilitator view)
        </button>
        {showFacilitator && (
          <>
            <p className="note" style={{ marginBottom: 8 }}>Updates as each player submits — not a live keystroke feed.</p>
            {Object.keys(hostRankingsRef.current).length === 0 && <p className="note">No submissions yet.</p>}
            {Object.entries(hostRankingsRef.current).map(([name, ranking]) => (
              <div className="facilitator-row" key={name}>
                <div className="name">{name}</div>
                <div className="order">{ranking.map((id) => itemName(scenario, id)).join(" → ")}</div>
              </div>
            ))}
          </>
        )}
      </div>
    );

    if (role === "host" && hostIsFacilitator) {
      return (
        <div className="wrap">
          <h2>Facilitating</h2>
          {timerWidget()}
          {referencePanel()}
          <p className="sub">{submittedNames.length} of {participantCount} players have submitted.</p>
          {players.filter((p) => !p.isHost).map((p) => (
            <div className="player-row" key={p.name}>
              <span>{p.name}</span>
              <span className={`tag ${submittedNames.includes(p.name) ? "done" : ""}`}>
                {submittedNames.includes(p.name) ? "Submitted" : "Ranking..."}
              </span>
            </div>
          ))}
          {facilitatorPanel}
          <button style={{ marginTop: 16 }} onClick={hostStartTeamPhase}>Start team rankings</button>
        </div>
      );
    }

    if (mySubmitted) {
      return (
        <div className="wrap">
          <h2>Ranking submitted</h2>
          {timerWidget()}
          {referencePanel()}
          <p className="sub">{submittedNames.length} of {participantCount} players have submitted.</p>
          {players.map((p) => (
            <div className="player-row" key={p.name}>
              <span>{p.name}</span>
              <span className={`tag ${submittedNames.includes(p.name) ? "done" : ""}`}>
                {submittedNames.includes(p.name) ? "Submitted" : "Ranking..."}
              </span>
            </div>
          ))}
          {facilitatorPanel}
          {role === "host" ? (
            <button style={{ marginTop: 16 }} onClick={hostStartTeamPhase}>Start team rankings</button>
          ) : (
            <p className="sub" style={{ marginTop: 16 }}>Waiting for the host to move on.</p>
          )}
        </div>
      );
    }
    return (
      <div className="wrap">
        <h2>Rank alone</h2>
        {timerWidget()}
        {referencePanel()}
        <p className="sub">No chatting yet. Order items 1 (most important) to {scenario.items.length}.</p>
        {myRanking.map((itemId, pos) => (
          <div className="item-row" key={itemId}>
            <span className="rank">{pos + 1}</span>
            <span className="name">{itemName(scenario, itemId)}</span>
            <div className="arrows">
              <button className="small" onClick={() => moveLocal(pos, -1)}>▲</button>
              <button className="small" onClick={() => moveLocal(pos, 1)}>▼</button>
            </div>
          </div>
        ))}
        <button style={{ marginTop: 14 }} onClick={role === "host" ? hostSubmitOwnRanking : peerSubmitRanking}>
          Submit my ranking
        </button>
        {facilitatorPanel}
      </div>
    );
  }

  if (phase === "teams") {
    if (role === "host") {
      const names = participantNames();
      const unassigned = names.filter((n) => !playerTeam[n]);
      const allAssigned = names.length > 0 && unassigned.length === 0;

      return (
        <div className="wrap">
          <h2>Set up teams</h2>
          {!assignMethod && (
            <>
              <p className="sub">Choose roughly how big each team should be, then how players get sorted into them.</p>
              <p className="section-label">Team size</p>
              <input type="number" min={1} value={teamSize} onChange={(e) => setTeamSize(Math.max(1, parseInt(e.target.value) || 1))} />
              <p className="note" style={{ marginBottom: 16 }}>
                {names.length} player{names.length === 1 ? "" : "s"} → about {Math.max(1, Math.round(names.length / teamSize))} team(s), named Alpha, Bravo, Charlie...
              </p>
              <p className="section-label">Assignment method</p>
              <button onClick={() => hostChooseMethod("auto")}>Auto-assign randomly</button>
              <button className="secondary" onClick={() => hostChooseMethod("manual")}>Assign manually</button>
              <button className="secondary" onClick={() => hostChooseMethod("self")}>Let players choose</button>
            </>
          )}

          {assignMethod && (
            <>
              <div className="scenario-picked">
                <div className="note">
                  {teamNames.length} team{teamNames.length === 1 ? "" : "s"}: {teamNames.join(", ")}
                </div>
              </div>

              {assignMethod === "auto" && (
                <button onClick={hostAutoAssign}>{Object.keys(playerTeam).length ? "Re-shuffle" : "Auto-assign now"}</button>
              )}

              {teamNames.map((tn) => {
                const members = Object.entries(playerTeam).filter(([, t]) => t === tn).map(([n]) => n);
                return (
                  <div key={tn}>
                    <p className="team-header">{tn}</p>
                    {members.length === 0 && <p className="note">No one assigned yet.</p>}
                    {members.map((m) => (
                      <div className="player-row" key={m}>
                        <span>{m}</span>
                        {assignMethod === "manual" && (
                          <button className="remove-btn" onClick={() => hostUnassign(m)}>Remove</button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}

              {assignMethod === "manual" && unassigned.length > 0 && (
                <>
                  <p className="team-header">Unassigned</p>
                  {unassigned.map((n) => (
                    <div key={n} style={{ marginBottom: 8 }}>
                      <div className="note" style={{ marginBottom: 4 }}>{n}</div>
                      {teamNames.map((tn) => (
                        <button key={tn} className="team-slot-btn" onClick={() => hostManualAssign(n, tn)}>→ {tn}</button>
                      ))}
                    </div>
                  ))}
                </>
              )}

              {assignMethod === "self" && (
                <p className="note" style={{ marginTop: 10 }}>
                  {unassigned.length === 0 ? "Everyone has picked a team." : `Waiting on: ${unassigned.join(", ")}`}
                </p>
              )}

              <button style={{ marginTop: 16 }} disabled={!allAssigned} onClick={hostShowBriefing}>Continue to briefing</button>
              <button className="secondary" onClick={() => setAssignMethod(null)}>Back to setup</button>
              {!allAssigned && <p className="note">Every player needs a team before starting.</p>}
            </>
          )}
        </div>
      );
    }

    const myTeam = playerTeam[myNameRef.current];
    if (teamNames.length === 0) {
      return <div className="wrap"><p className="sub">The host is setting up teams...</p></div>;
    }
    if (myTeam) {
      return (
        <div className="wrap">
          <h2>You're on {myTeam}</h2>
          <p className="sub">Waiting for the host to start team rankings.</p>
        </div>
      );
    }
    return (
      <div className="wrap">
        <h2>Choose your team</h2>
        <p className="sub">Tap a team to join it.</p>
        {teamNames.map((tn) => {
          const count = Object.values(playerTeam).filter((t) => t === tn).length;
          return (
            <button key={tn} className="secondary" onClick={() => peerJoinTeam(tn)}>
              {tn} ({count})
            </button>
          );
        })}
      </div>
    );
  }

  if (phase === "team") {
    if (role === "host" && hostIsFacilitator) {
      return (
        <div className="wrap">
          <h2>Facilitating</h2>
          {timerWidget()}
          <p className="sub">Watching all teams rank together live.</p>
          {teamNames.map((tn) => (
            <div key={tn} className="facilitator-panel">
              <p className="team-header" style={{ marginTop: 0 }}>{tn}</p>
              <p className="note">{(teamRankings[tn] || []).map((id) => itemName(scenario, id)).join(" → ")}</p>
            </div>
          ))}
          <button style={{ marginTop: 16 }} onClick={hostReveal}>Reveal the expert ranking</button>
        </div>
      );
    }

    const myTeam = playerTeam[myNameRef.current];
    if (!myTeam) {
      return <div className="wrap"><p className="sub">Waiting for a team assignment...</p></div>;
    }
    const ranking = teamRankings[myTeam] || [];

    return (
      <div className="wrap">
        <h2>{myTeam}: rank as a team</h2>
        {timerWidget()}
        {referencePanel()}
        <p className="sub">Talk it through, then whoever's holding a phone updates the list — it syncs live to your team.</p>
        {ranking.map((itemId, pos) => (
          <div className="item-row" key={itemId}>
            <span className="rank">{pos + 1}</span>
            <span className="name">{itemName(scenario, itemId)}</span>
            <div className="arrows">
              <button className="small" onClick={() => (role === "host" ? applyTeamMove(myTeam, itemId, -1) : peerSendTeamMove(myTeam, itemId, -1))}>▲</button>
              <button className="small" onClick={() => (role === "host" ? applyTeamMove(myTeam, itemId, 1) : peerSendTeamMove(myTeam, itemId, 1))}>▼</button>
            </div>
          </div>
        ))}
        {role === "host" ? (
          <button style={{ marginTop: 14 }} onClick={hostReveal}>Reveal the expert ranking</button>
        ) : (
          <p className="sub" style={{ marginTop: 14 }}>The host will reveal when ready.</p>
        )}
      </div>
    );
  }

  if (phase === "reveal" && revealData) {
    const expertIds = expertOrder(scenario);
    const team = revealData.teams.find((t) => t.name === selectedTeamView) || revealData.teams[0];
    if (!team) return <div className="wrap"><p className="sub">No team data.</p></div>;

    const radarData = DIM_KEYS.map((d) => {
      const row: any = {
        dimension: DIMENSION_LABELS[d],
        Team: Math.round(team.teamStyle[d] * 100),
        Expert: Math.round(revealData.expertStyle[d] * 100),
      };
      team.members.forEach((m) => {
        if (revealData.individualStyles[m]) row[m] = Math.round(revealData.individualStyles[m][d] * 100);
      });
      return row;
    });

    return (
      <div className="wrap">
        <span className="stamp">Round complete</span>
        <h2>Results</h2>
        <p className="sub">{scenario.title}</p>

        {revealData.teams.length > 1 && (
          <div className="tabs" style={{ flexWrap: "wrap" }}>
            {revealData.teams.map((t) => (
              <button key={t.name} className={t.name === selectedTeamView ? "" : "inactive"} onClick={() => setSelectedTeamView(t.name)}>
                {t.name}
              </button>
            ))}
          </div>
        )}

        <div className="hero-synergy">
          <div className={`num ${team.synergy <= 0 ? "negative" : ""}`}>
            {team.synergy > 0 ? "+" : ""}{team.synergy.toFixed(1)}
          </div>
          <div className="label">
            {team.name} synergy score — {team.synergy > 0
              ? "the team beat its own average member. Discussion improved the outcome."
              : "the team scored worse than its average member, a sign the group deferred to the wrong voice."}
          </div>
        </div>

        {revealData.scores.filter((s) => team.members.includes(s.name)).map((s) => (
          <div className="score-row" key={s.name}><span>{s.name}</span><span>{s.score}</span></div>
        ))}
        <div className="score-row">
          <span>Average individual</span><span>{team.avgIndividual.toFixed(1)}</span>
        </div>
        <div className="score-row total"><span>{team.name}</span><span>{team.teamScore}</span></div>

        <p className="section-label">Full comparison — {team.name}</p>
        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Expert</th>
                <th>{team.name}</th>
                {showIndividualLines && team.members.map((m) => <th key={m}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {expertIds.map((itemId, idx) => {
                const expertPos = idx + 1;
                const teamPos = team.ranking.indexOf(itemId) + 1;
                return (
                  <tr key={itemId}>
                    <td>{itemName(scenario, itemId)}</td>
                    <td>{expertPos}</td>
                    <td style={{ color: deltaColor(teamPos - expertPos) }}>{teamPos}</td>
                    {showIndividualLines &&
                      team.members.map((m) => {
                        const ranking = revealData.individualRankings[m] || [];
                        const pos = ranking.indexOf(itemId) + 1;
                        return (
                          <td key={m} style={{ color: pos ? deltaColor(pos - expertPos) : undefined }}>
                            {pos || "—"}
                          </td>
                        );
                      })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button className="secondary" onClick={() => setShowIndividualLines(!showIndividualLines)}>
          {showIndividualLines ? "Hide" : "Show"} individual players
        </button>

        <p className="section-label">Team style vs. expert logic</p>
        {showIndividualLines && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "10px 0" }}>
            {team.members.map((m, i) => (
              <div className="legend-row" key={m}>
                <span className="legend-dot" style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }} />
                {m}
              </div>
            ))}
          </div>
        )}
        <ResponsiveContainer width="100%" height={280}>
          <RadarChart data={radarData} outerRadius={80}>
            <PolarGrid stroke="#3B362C" />
            <PolarAngleAxis dataKey="dimension" tick={{ fill: "#9C9280", fontSize: 11 }} />
            <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
            <Radar name="Team" dataKey="Team" stroke="#C97A3D" fill="#C97A3D" fillOpacity={0.35} />
            <Radar name="Expert" dataKey="Expert" stroke="#7FA88C" fill="#7FA88C" fillOpacity={0.2} />
            {showIndividualLines &&
              team.members.map((m, i) => (
                <Radar key={m} name={m} dataKey={m} stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]} fill={PLAYER_COLORS[i % PLAYER_COLORS.length]} fillOpacity={0.05} />
              ))}
            <Legend wrapperStyle={{ fontSize: 12, color: "#9C9280" }} />
          </RadarChart>
        </ResponsiveContainer>

        {team.flags.length > 0 && (
          <>
            <p className="section-label">Patterns worth noticing</p>
            {team.flags.map((f, i) => <div className="bias-flag" key={i}>{f}</div>)}
          </>
        )}

        <p className="section-label">{team.name} ranking vs. expert order</p>
        <p className="note" style={{ marginBottom: 10 }}>Tap an item to see why the expert ranked it there.</p>
        {team.ranking.map((itemId, pos) => {
          const expertPos = expertIds.indexOf(itemId);
          const delta = pos - expertPos;
          const color = deltaColor(delta);
          const isExpanded = expandedReasoningId === itemId;
          return (
            <div key={itemId}>
              <div className="delta-row clickable" style={{ borderLeftColor: color }} onClick={() => setExpandedReasoningId(isExpanded ? null : itemId)}>
                <span>{pos + 1}. {itemName(scenario, itemId)}</span>
                <span style={{ color }}>{delta === 0 ? "exact" : delta > 0 ? `+${delta}` : delta}</span>
              </div>
              {isExpanded && (
                <div className="reasoning-slide">Expert rank #{expertPos + 1}: {itemReasoning(scenario, itemId)}</div>
              )}
            </div>
          );
        })}

        <button className="secondary" style={{ marginTop: 20 }} onClick={exportPdf}>Download PDF summary</button>

        {role === "host" && (
          <>
            <p className="section-label">What's next?</p>
            <button onClick={hostChangeScenario}>Play another round</button>
            <p className="note" style={{ textAlign: "center", marginBottom: 14 }}>Keeps everyone connected — no code or link needed again.</p>
            <p className="note" style={{ textAlign: "center" }}>
              <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={hostEndSession}>End the session instead</span>
            </p>
          </>
        )}
      </div>
    );
  }

  return <div className="wrap"><p className="sub">Loading...</p></div>;
}
