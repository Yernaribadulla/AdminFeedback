// Progressive enhancement: the native select remains the source of filter values.
export function initPeriodPicker() {
  const select = document.getElementById("month-select");
  const wrapper = select.parentElement;
  const label = wrapper.querySelector("label");
  const button = document.createElement("button");
  button.type = "button";
  button.id = "period-trigger";
  button.className = "period-trigger";
  button.setAttribute("role", "combobox");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-controls", "period-options");
  label.id = "period-label";
  label.htmlFor = button.id;
  button.setAttribute("aria-labelledby", label.id);
  const value = document.createElement("span");
  const chevron = document.createElement("span");
  chevron.className = "period-chevron";
  chevron.setAttribute("aria-hidden", "true");
  button.append(value, chevron);
  const list = document.createElement("div");
  list.id = "period-options";
  list.className = "period-options";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-labelledby", label.id);
  list.hidden = true;
  wrapper.append(button, list);
  select.hidden = true;
  let active = 0;
  let search = "";
  let searchTimer;

  function highlight(index) {
    active = Math.max(0, Math.min(index, list.children.length - 1));
    [...list.children].forEach((option, i) => {
      option.classList.toggle("is-highlighted", i === active);
    });
    if (!list.hidden && list.children[active]) {
      button.setAttribute("aria-activedescendant", list.children[active].id);
      list.children[active].scrollIntoView({ block: "nearest" });
    }
  }
  function sync() {
    value.textContent = select.selectedOptions[0]?.textContent || "Всё время";
    list.replaceChildren(
      ...[...select.options].map((item, index) => {
        const option = document.createElement("div");
        option.id = `period-option-${index}`;
        option.className = "period-option";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(item.selected));
        option.textContent = item.textContent;
        option.addEventListener("click", () => choose(index));
        return option;
      }),
    );
    highlight(select.selectedIndex);
  }
  function close() {
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-activedescendant");
    wrapper.classList.remove("is-open");
    search = "";
  }
  function open() {
    list.hidden = false;
    button.setAttribute("aria-expanded", "true");
    wrapper.classList.add("is-open");
    highlight(select.selectedIndex);
  }
  function choose(index) {
    select.selectedIndex = index;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    sync();
    close();
    button.focus({ preventScroll: true });
  }
  button.addEventListener("click", () => (list.hidden ? open() : close()));
  button.addEventListener("keydown", (event) => {
    const key = event.key;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
      event.preventDefault();
      if (list.hidden) open();
      else if (key === "ArrowDown") highlight(active + 1);
      else if (key === "ArrowUp") highlight(active - 1);
      if (key === "Home") highlight(0);
      if (key === "End") highlight(list.children.length - 1);
    } else if (key === "Escape") {
      if (!list.hidden) event.preventDefault();
      close();
    } else if ((key === "Enter" || key === " ") && !list.hidden) {
      event.preventDefault();
      choose(active);
    } else if (key === "Tab") close();
    else if (
      key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      key !== " "
    ) {
      event.preventDefault();
      if (list.hidden) open();
      search += key.toLocaleLowerCase("ru");
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => (search = ""), 600);
      const index = [...select.options].findIndex((item) =>
        item.textContent.toLocaleLowerCase("ru").startsWith(search),
      );
      if (index !== -1) highlight(index);
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!wrapper.contains(event.target)) close();
  });
  wrapper.addEventListener("focusout", (event) => {
    // A pointer press on a non-focusable option briefly moves focus to body.
    // Outside clicks and Tab are handled separately; keep the option clickable.
    if (event.relatedTarget && !wrapper.contains(event.relatedTarget)) close();
  });
  select.addEventListener("change", sync);
  new MutationObserver(sync).observe(select, { childList: true });
  sync();
}
