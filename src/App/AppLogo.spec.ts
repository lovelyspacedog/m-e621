import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AppLogo from "./AppLogo.vue";

describe("AppLogo", () => {
  it("shows eyes on the loader", () => {
    const wrapper = mount(AppLogo, { props: { type: "loader" } });
    expect(wrapper.findAll(".eye")).toHaveLength(2);
  });

  it("keeps eyes on the face mark", () => {
    const wrapper = mount(AppLogo, { props: { type: "face" } });
    expect(wrapper.findAll(".eye")).toHaveLength(2);
  });

  it("does not draw eyes on the wordmark", () => {
    const wrapper = mount(AppLogo, { props: { type: "text" } });
    expect(wrapper.findAll(".eye")).toHaveLength(0);
  });

  it("labels Baxter as the PawFeed mascot", () => {
    const wrapper = mount(AppLogo, { props: { type: "face" } });
    expect(wrapper.find("svg").attributes("aria-label")).toBe(
      "Baxter, PawFeed mascot",
    );
  });

  it("shows the PawFeed wordmark in text mode", () => {
    const wrapper = mount(AppLogo, { props: { type: "text" } });
    expect(wrapper.find(".wordmark text").text()).toBe("PawFeed");
  });

  it("draws the tail on the face mark", () => {
    const wrapper = mount(AppLogo, { props: { type: "face" } });
    expect(wrapper.find(".tail").exists()).toBe(true);
  });
});
