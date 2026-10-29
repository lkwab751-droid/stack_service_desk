"use strict";

/* ---------- Stack data structure (last in, first out) ---------- */

class Stack {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
  }

  pop() {
    if (this.items.length === 0) throw new Error("The stack is empty.");
    return this.items.pop();
  }

  peek() {
    return this.items.length === 0 ? null : this.items[this.items.length - 1];
  }

  isEmpty() {
    return this.items.length === 0;
  }

  get size() {
    return this.items.length;
  }

  // Top of the stack first.
  toTopFirst() {
    return this.items.slice().reverse();
  }
}

/* ---------- Service desk logic ---------- */

const SERVICES = {
  deposit: { code: "D", label: "Deposit" },
  loan: { code: "L", label: "Loan" },
  account: { code: "A", label: "New account" },
};

const COUNTER_SERVICES = {
  1: ["deposit", "account"],
  2: ["deposit", "loan"],
  3: ["account", "loan"],
};

class ServiceDesk {
  constructor() {
    this.priority = {};
    this.regular = {};
    this.issued = {};
    for (const s of Object.keys(SERVICES)) {
      this.priority[s] = new Stack();
      this.regular[s] = new Stack();
      this.issued[s] = 0;
    }
    this.current = {};
    for (const id of Object.keys(COUNTER_SERVICES)) this.current[id] = null;
    this.history = [];
    this.seq = 0;
  }

  // The new ticket goes on top of its pile.
  issueTicket(customer, service, priority) {
    if (!SERVICES[service]) throw new Error("Choose a service.");
    this.issued[service]++;
    this.seq++;
    const ticket = {
      code: SERVICES[service].code + String(this.issued[service]).padStart(3, "0"),
      customer: customer,
      service: service,
      priority: priority,
      seq: this.seq,
      createdAt: Date.now(),
      calledAt: null,
      finishedAt: null,
      counter: null,
    };
    (priority ? this.priority : this.regular)[service].push(ticket);
    return ticket;
  }

  topOf(service) {
    return this.priority[service].peek() || this.regular[service].peek();
  }

  // Priority tickets first; otherwise the NEWEST customer (last in, first out).
  callNext(counterId) {
    if (this.current[counterId]) throw new Error("Counter " + counterId + " is still serving a customer.");
    const candidates = COUNTER_SERVICES[counterId]
      .map((s) => this.topOf(s))
      .filter(Boolean);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => (b.priority - a.priority) || (b.seq - a.seq));
    const best = candidates[0];
    (best.priority ? this.priority : this.regular)[best.service].pop();
    best.calledAt = Date.now();
    best.counter = counterId;
    this.current[counterId] = best;
    return best;
  }

  complete(counterId) {
    const ticket = this.current[counterId];
    if (!ticket) throw new Error("Counter " + counterId + " is not serving anyone.");
    ticket.finishedAt = Date.now();
    this.current[counterId] = null;
    this.history.push(ticket);
    return ticket;
  }

  // Everyone waiting: priority first, then newest first.
  waiting() {
    const all = [];
    for (const s of Object.keys(SERVICES)) {
      all.push(...this.priority[s].toTopFirst(), ...this.regular[s].toTopFirst());
    }
    return all.sort((a, b) => (b.priority - a.priority) || (b.seq - a.seq));
  }

  stats() {
    const inService = Object.values(this.current).filter(Boolean);
    const called = [...this.history, ...inService];
    const waits = called.map((t) => t.calledAt - t.createdAt);
    return {
      served: this.history.length,
      inService: inService.length,
      waiting: this.waiting().length,
      avgWait: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0,
      maxWait: waits.length ? Math.max(...waits) : 0,
    };
  }
}

/* ---------- User interface ---------- */

const desk = new ServiceDesk();
const byId = (id) => document.getElementById(id);

function esc(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function clock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}

function say(text) {
  byId("message").textContent = text;
}

function renderCounters() {
  byId("counters").innerHTML = Object.keys(COUNTER_SERVICES).map((id) => {
    const t = desk.current[id];
    const handles = COUNTER_SERVICES[id].map((s) => SERVICES[s].label).join(" and ");
    const now = t
      ? '<span class="code">' + t.code + "</span>" +
        '<span class="who">' + esc(t.customer) + (t.priority ? " (priority)" : "") + "</span>" +
        '<span class="timer">Serving for <span data-since="' + t.calledAt + '"></span></span>'
      : '<span class="free">Free</span>';
    return (
      '<article class="counter' + (t ? " busy" : "") + '">' +
      "<h3>Counter " + id + "</h3>" +
      '<p class="handles">Serves ' + handles + "</p>" +
      '<div class="now">' + now + "</div>" +
      '<div class="actions">' +
      '<button type="button" data-act="call" data-id="' + id + '"' + (t ? " disabled" : "") + ">Call next</button>" +
      '<button type="button" data-act="done" data-id="' + id + '"' + (t ? "" : " disabled") + ">Finish</button>" +
      "</div></article>"
    );
  }).join("");
}

function renderLine() {
  const list = desk.waiting();
  byId("line-count").textContent = "(" + list.length + ")";
  byId("line").innerHTML = list.length
    ? list.map((t, i) =>
        '<li class="' + (t.priority ? "prio" : "") + (i === 0 ? " first" : "") + '">' +
        '<span class="code">' + t.code + "</span>" +
        "<span>" + esc(t.customer) +
        '<span class="svc">' + SERVICES[t.service].label + (t.priority ? ", priority" : "") + (i === 0 ? ", top of the pile" : "") + "</span></span>" +
        '<span class="wait">Waiting <span data-since="' + t.createdAt + '"></span></span>' +
        "</li>"
      ).join("")
    : '<li class="empty">Nobody is waiting. Take a ticket to join the pile.</li>';
}

function renderStats() {
  const s = desk.stats();
  const items = [
    ["Served", s.served],
    ["Being served", s.inService],
    ["Waiting", s.waiting],
    ["Average wait", clock(s.avgWait)],
    ["Longest wait", clock(s.maxWait)],
  ];
  byId("stats").innerHTML = items
    .map((i) => "<div><dt>" + i[0] + "</dt><dd>" + i[1] + "</dd></div>")
    .join("");
}

function tick() {
  const now = Date.now();
  document.querySelectorAll("[data-since]").forEach((el) => {
    el.textContent = clock(now - Number(el.dataset.since));
  });
}

function render() {
  renderCounters();
  renderLine();
  renderStats();
  tick();
}

/* ---------- Events ---------- */

const serviceSelect = byId("service");
serviceSelect.innerHTML = Object.keys(SERVICES)
  .map((k) => '<option value="' + k + '">' + SERVICES[k].label + "</option>")
  .join("");

byId("ticket-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = byId("name").value.trim() || "Guest";
  const ticket = desk.issueTicket(name, serviceSelect.value, byId("priority").checked);
  const ahead = desk.waiting().findIndex((t) => t.seq === ticket.seq);
  say("Ticket " + ticket.code + " for " + name + ". " + ahead + " ahead of you right now. Anyone who arrives later will be called before you.");
  byId("name").value = "";
  byId("priority").checked = false;
  render();
});

byId("random").addEventListener("click", () => {
  const names = ["Ada", "Ben", "Chi", "Dee", "Eli", "Fay", "Gus", "Hana", "Ivo", "Jo"];
  const keys = Object.keys(SERVICES);
  for (let i = 0; i < 5; i++) {
    const name = names[Math.floor(Math.random() * names.length)];
    const service = keys[Math.floor(Math.random() * keys.length)];
    desk.issueTicket(name, service, Math.random() < 0.15);
  }
  say("Added 5 random customers on top of the pile.");
  render();
});

byId("counters").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-act]");
  if (!button) return;
  const id = button.dataset.id;
  try {
    if (button.dataset.act === "call") {
      const t = desk.callNext(id);
      say(t ? "Counter " + id + " is calling " + t.code + " (" + t.customer + ")." : "Nobody that counter serves is waiting.");
    } else {
      const t = desk.complete(id);
      say("Counter " + id + " finished " + t.code + ".");
    }
  } catch (err) {
    say(err.message);
  }
  render();
});

render();
setInterval(tick, 1000);
