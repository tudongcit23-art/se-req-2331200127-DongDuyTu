const STATUSES = [
  { id: "todo", label: "To do" },
  { id: "progress", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" }
];

const STORAGE_KEY = "professional-kanban-board";
const LAST_SAVED_KEY = "professional-kanban-board-last-saved";
const ANALYSIS_FIELDS = [
  "ambiguity1",
  "ambiguity2",
  "conflictSolution",
  "nfr1",
  "nfr2",
  "nfr3"
];

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const initialState = {
  groups: [
    { id: createId(), name: "Blockers", color: "#2563eb" },
    { id: createId(), name: "Standard Work", color: "#059669" },
    { id: createId(), name: "Minors", color: "#d97706" }
  ],
  tickets: [],
  analysis: {
    ambiguity1: "",
    ambiguity2: "",
    conflictSolution: "",
    nfr1: "",
    nfr2: "",
    nfr3: ""
  }
};

let state = loadState();
let editingTicketId = null;
let editingGroupId = null;

const board = document.querySelector("#board");
const addTicketButton = document.querySelector("#addTicketButton");
const addGroupButton = document.querySelector("#addGroupButton");
const saveButton = document.querySelector("#saveButton");
const boardViewTab = document.querySelector("#boardViewTab");
const analysisViewTab = document.querySelector("#analysisViewTab");
const boardView = document.querySelector("#boardView");
const analysisView = document.querySelector("#analysisView");
const importButton = document.querySelector("#importButton");
const fileInput = document.querySelector("#fileInput");
const ticketDialog = document.querySelector("#ticketDialog");
const ticketForm = document.querySelector("#ticketForm");
const groupDialog = document.querySelector("#groupDialog");
const groupForm = document.querySelector("#groupForm");
const toast = document.querySelector("#toast");
const addNfrEpicsButton = document.querySelector("#addNfrEpicsButton");

const ticketFields = {
  title: document.querySelector("#ticketTitle"),
  description: document.querySelector("#ticketDescription"),
  group: document.querySelector("#ticketGroup"),
  status: document.querySelector("#ticketStatus"),
  type: document.querySelector("#ticketType"),
  priority: document.querySelector("#ticketPriority"),
  owner: document.querySelector("#ticketOwner")
};

const groupFields = {
  name: document.querySelector("#groupName"),
  color: document.querySelector("#groupColor")
};

const analysisFields = Object.fromEntries(
  ANALYSIS_FIELDS.map((fieldId) => [fieldId, document.querySelector(`#${fieldId}`)])
);

function loadState() {
  return JSON.parse(JSON.stringify(initialState));
}

function normalizeState(nextState) {
  const groups = Array.isArray(nextState.groups) ? nextState.groups : [];
  const tickets = Array.isArray(nextState.tickets) ? nextState.tickets : [];

  const cleanGroups = groups
    .filter((group) => group && group.id && group.name)
    .map((group) => ({
      id: String(group.id),
      name: String(group.name).slice(0, 50),
      color: /^#[0-9a-f]{6}$/i.test(group.color) ? group.color : "#2563eb"
    }));

  if (cleanGroups.length === 0) {
    cleanGroups.push({ id: createId(), name: "General", color: "#2563eb" });
  }

  const groupIds = new Set(cleanGroups.map((group) => group.id));
  const statusIds = new Set(STATUSES.map((status) => status.id));
  const cleanTickets = tickets
    .filter((ticket) => ticket && ticket.id && ticket.title)
    .map((ticket) => ({
      id: String(ticket.id),
      title: String(ticket.title).slice(0, 90),
      description: String(ticket.description || "").slice(0, 500),
      groupId: groupIds.has(ticket.groupId) ? ticket.groupId : cleanGroups[0].id,
      status: statusIds.has(ticket.status) ? ticket.status : "todo",
      type: ["User Story", "Epic"].includes(ticket.type) ? ticket.type : "User Story",
      priority: ["Low", "Medium", "High", "Urgent"].includes(ticket.priority) ? ticket.priority : "Medium",
      owner: String(ticket.owner || "").slice(0, 40)
    }));
  const analysis = Object.fromEntries(
    ANALYSIS_FIELDS.map((fieldId) => [fieldId, String(nextState.analysis?.[fieldId] || "").slice(0, 1500)])
  );

  return { groups: cleanGroups, tickets: cleanTickets, analysis };
}

function persistLocal() {
  render();
}

function render() {
  renderSelectOptions();
  renderBoard();
  renderMetrics();
  renderAnalysisFields();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderAnalysisFields() {
  ANALYSIS_FIELDS.forEach((fieldId) => {
    if (analysisFields[fieldId]) {
      analysisFields[fieldId].value = state.analysis[fieldId] || "";
    }
  });
}

function renderSelectOptions() {
  ticketFields.group.innerHTML = state.groups
    .map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`)
    .join("");

  ticketFields.status.innerHTML = STATUSES
    .map((status) => `<option value="${status.id}">${status.label}</option>`)
    .join("");
}

function renderBoard() {
  board.innerHTML = state.groups.map(renderGroupRow).join("");
  bindRenderedActions();
}

function renderGroupRow(group) {
  const ticketsInGroup = state.tickets.filter((ticket) => ticket.groupId === group.id);
  const columns = STATUSES.map((status) => renderColumn(group, status)).join("");

  return `
    <article class="group-row" style="--group-color: ${group.color}">
      <aside class="group-label">
        <div class="group-title-wrap">
          <h3 class="group-title">${escapeHtml(group.name)}</h3>
          <div class="group-count">${ticketsInGroup.length} ticket${ticketsInGroup.length === 1 ? "" : "s"}</div>
        </div>
        <span></span>
        <div class="group-actions">
          <button class="icon-button" type="button" data-edit-group="${escapeHtml(group.id)}" title="Edit group" aria-label="Edit group">
            <i data-lucide="pencil" data-fallback="E"></i>
          </button>
          <button class="icon-button" type="button" data-delete-group="${escapeHtml(group.id)}" title="Delete group" aria-label="Delete group">
            <i data-lucide="trash-2" data-fallback="D"></i>
          </button>
        </div>
      </aside>
      ${columns}
    </article>
  `;
}

function renderColumn(group, status) {
  const tickets = state.tickets.filter((ticket) => ticket.groupId === group.id && ticket.status === status.id);
  const content = tickets.length
    ? tickets.map(renderTicket).join("")
    : `<div class="empty-column">No tickets</div>`;

  return `
    <div class="ticket-column" data-group-id="${escapeHtml(group.id)}" data-status="${status.id}">
      ${content}
    </div>
  `;
}

function renderTicket(ticket) {
  const owner = ticket.owner ? `<span class="pill">${escapeHtml(ticket.owner)}</span>` : "";
  const type = `<span class="pill">${escapeHtml(ticket.type)}</span>`;
  const description = ticket.description ? `<p class="ticket-description">${escapeHtml(ticket.description)}</p>` : "";

  return `
    <article class="ticket-card" draggable="true" data-ticket-id="${escapeHtml(ticket.id)}">
      <header>
        <h4 class="ticket-title">${escapeHtml(ticket.title)}</h4>
        <div class="card-actions">
          <button class="icon-button" type="button" data-edit-ticket="${escapeHtml(ticket.id)}" title="Edit ticket" aria-label="Edit ticket">
            <i data-lucide="pencil" data-fallback="E"></i>
          </button>
          <button class="icon-button" type="button" data-delete-ticket="${escapeHtml(ticket.id)}" title="Delete ticket" aria-label="Delete ticket">
            <i data-lucide="trash-2" data-fallback="D"></i>
          </button>
        </div>
      </header>
      ${description}
      <div class="ticket-meta">
        ${type}
        <span class="pill priority-${escapeHtml(ticket.priority)}">${escapeHtml(ticket.priority)}</span>
        ${owner}
      </div>
    </article>
  `;
}

function renderMetrics() {
  document.querySelector("#ticketCount").textContent = state.tickets.length;
  document.querySelector("#groupCount").textContent = state.groups.length;
  document.querySelector("#lastSaved").textContent = localStorage.getItem(LAST_SAVED_KEY) || "Not saved";
}

function bindRenderedActions() {
  document.querySelectorAll("[data-edit-ticket]").forEach((button) => {
    button.addEventListener("click", () => openTicketDialog(button.dataset.editTicket));
  });

  document.querySelectorAll("[data-delete-ticket]").forEach((button) => {
    button.addEventListener("click", () => deleteTicket(button.dataset.deleteTicket));
  });

  document.querySelectorAll("[data-edit-group]").forEach((button) => {
    button.addEventListener("click", () => openGroupDialog(button.dataset.editGroup));
  });

  document.querySelectorAll("[data-delete-group]").forEach((button) => {
    button.addEventListener("click", () => deleteGroup(button.dataset.deleteGroup));
  });

  document.querySelectorAll(".ticket-card").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", card.dataset.ticketId);
      event.dataTransfer.effectAllowed = "move";
    });
  });

  document.querySelectorAll(".ticket-column").forEach((column) => {
    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      column.classList.add("is-over");
    });

    column.addEventListener("dragleave", () => {
      column.classList.remove("is-over");
    });

    column.addEventListener("drop", (event) => {
      event.preventDefault();
      column.classList.remove("is-over");
      moveTicket(event.dataTransfer.getData("text/plain"), column.dataset.groupId, column.dataset.status);
    });
  });
}

function openTicketDialog(ticketId = null) {
  editingTicketId = ticketId;
  const ticket = state.tickets.find((item) => item.id === ticketId);

  document.querySelector("#ticketDialogTitle").textContent = ticket ? "Edit ticket" : "Add ticket";
  ticketFields.title.value = ticket?.title || "";
  ticketFields.description.value = ticket?.description || "";
  ticketFields.group.value = ticket?.groupId || findStandardWorkGroupId() || state.groups[0]?.id || "";
  ticketFields.status.value = ticket?.status || "todo";
  ticketFields.type.value = ticket?.type || "User Story";
  ticketFields.priority.value = ticket?.priority || "Medium";
  ticketFields.owner.value = ticket?.owner || "";

  ticketDialog.showModal();
  ticketFields.title.focus();
}

function openGroupDialog(groupId = null) {
  editingGroupId = groupId;
  const group = state.groups.find((item) => item.id === groupId);

  document.querySelector("#groupDialogTitle").textContent = group ? "Edit group" : "Add group";
  groupFields.name.value = group?.name || "";
  groupFields.color.value = group?.color || "#2563eb";

  groupDialog.showModal();
  groupFields.name.focus();
}

function upsertTicket(event) {
  event.preventDefault();
  const ticket = {
    id: editingTicketId || createId(),
    title: ticketFields.title.value.trim(),
    description: ticketFields.description.value.trim(),
    groupId: ticketFields.group.value,
    status: ticketFields.status.value,
    type: ticketFields.type.value,
    priority: ticketFields.priority.value,
    owner: ticketFields.owner.value.trim()
  };

  if (!ticket.title) {
    return;
  }

  if (editingTicketId) {
    state.tickets = state.tickets.map((item) => item.id === editingTicketId ? ticket : item);
  } else {
    ticket.groupId = findStandardWorkGroupId() || ticket.groupId;
    state.tickets.push(ticket);
  }

  ticketDialog.close();
  editingTicketId = null;
  persistLocal();
}

function upsertGroup(event) {
  event.preventDefault();
  const group = {
    id: editingGroupId || createId(),
    name: groupFields.name.value.trim(),
    color: groupFields.color.value
  };

  if (!group.name) {
    return;
  }

  if (editingGroupId) {
    state.groups = state.groups.map((item) => item.id === editingGroupId ? group : item);
  } else {
    state.groups.push(group);
  }

  groupDialog.close();
  editingGroupId = null;
  persistLocal();
}

function deleteTicket(ticketId) {
  state.tickets = state.tickets.filter((ticket) => ticket.id !== ticketId);
  persistLocal();
}

function deleteGroup(groupId) {
  if (state.groups.length === 1) {
    showToast("Keep at least one group on the board.");
    return;
  }

  const targetIndex = state.groups.findIndex((group) => group.id === groupId);
  const fallbackGroup = state.groups.find((group) => group.id !== groupId);
  state.groups.splice(targetIndex, 1);
  state.tickets = state.tickets.map((ticket) => (
    ticket.groupId === groupId ? { ...ticket, groupId: fallbackGroup.id } : ticket
  ));

  persistLocal();
}

function moveTicket(ticketId, groupId, status) {
  state.tickets = state.tickets.map((ticket) => (
    ticket.id === ticketId ? { ...ticket, groupId, status } : ticket
  ));
  persistLocal();
}

function setActiveView(view) {
  const isBoard = view === "board";
  boardView.classList.toggle("active", isBoard);
  analysisView.classList.toggle("active", !isBoard);
  boardViewTab.classList.toggle("active", isBoard);
  analysisViewTab.classList.toggle("active", !isBoard);
}

function saveAnalysisField(fieldId, value) {
  state.analysis[fieldId] = value;
}

function findStandardWorkGroupId() {
  const standardGroup = state.groups.find((group) => group.name.trim().toLowerCase() === "standard work");
  return standardGroup ? standardGroup.id : state.groups[0]?.id || "";
}

function addNfrEpics() {
  const nfrEntries = [state.analysis.nfr1, state.analysis.nfr2, state.analysis.nfr3]
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (nfrEntries.length !== 3) {
    showToast("Please complete all 3 NFR fields in Part A first.");
    setActiveView("analysis");
    return;
  }

  const groupId = findStandardWorkGroupId();
  const existingTitles = new Set(state.tickets.map((ticket) => ticket.title.trim().toLowerCase()));
  let addedCount = 0;

  nfrEntries.forEach((nfrText, index) => {
    const title = `NFR Epic ${index + 1}: ${nfrText.slice(0, 70)}`;
    if (existingTitles.has(title.trim().toLowerCase())) {
      return;
    }

    state.tickets.push({
      id: createId(),
      title,
      description: nfrText,
      groupId,
      status: "todo",
      type: "Epic",
      priority: "Medium",
      owner: ""
    });
    addedCount += 1;
  });

  persistLocal();
  setActiveView("board");
  showToast(addedCount ? `${addedCount} NFR epic ticket(s) added.` : "NFR epic tickets already exist.");
}

async function saveJson() {
  const payload = JSON.stringify(
    {
      savedAt: new Date().toISOString(),
      ...state
    },
    null,
    2
  );

  const savedLabel = new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  localStorage.setItem(LAST_SAVED_KEY, savedLabel);

  if ("showSaveFilePicker" in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "submission.json", // Changed from kanban-board.json
        types: [
          {
            description: "JSON file",
            accept: { "application/json": [".json"] }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(payload);
      await writable.close();
      showToast("Board saved to JSON.");
      renderMetrics();
      return;
    } catch (error) {
      if (error.name === "AbortError") {
        renderMetrics();
        return;
      }
    }
  }

  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "submission.json"; // Changed from kanban-board.json
  link.click();
  URL.revokeObjectURL(url);
  showToast("Board JSON downloaded.");
  renderMetrics();
}

function importJson(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      state = normalizeState(JSON.parse(reader.result));
      persistLocal();
      showToast("Board imported.");
    } catch {
      showToast("The selected file is not valid JSON.");
    }
  });
  reader.readAsText(file);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

addTicketButton.addEventListener("click", () => openTicketDialog());
addGroupButton.addEventListener("click", () => openGroupDialog());
boardViewTab.addEventListener("click", () => setActiveView("board"));
analysisViewTab.addEventListener("click", () => setActiveView("analysis"));
ticketForm.addEventListener("submit", upsertTicket);
groupForm.addEventListener("submit", upsertGroup);
saveButton.addEventListener("click", saveJson);
addNfrEpicsButton.addEventListener("click", addNfrEpics);
importButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const [file] = fileInput.files;
  if (file) {
    importJson(file);
  }
  fileInput.value = "";
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(`#${button.dataset.closeDialog}`).close();
  });
});

ANALYSIS_FIELDS.forEach((fieldId) => {
  analysisFields[fieldId].addEventListener("input", (event) => {
    saveAnalysisField(fieldId, event.target.value);
  });
});

if (state.groups.length > 0) {
  const standardWorkGroupId = findStandardWorkGroupId();
  if (standardWorkGroupId) {
    ticketFields.group.value = standardWorkGroupId;
  }
}

render();
