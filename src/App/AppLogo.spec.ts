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
});
