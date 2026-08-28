import { WebHomeWidgetWithParam } from "./web_home_widget";

export interface UserConfig {}

export interface UserConfigWebUI {
  widgets: WebHomeWidgetWithParam[];
  theme: "light" | "dark" | "system";
  show_ui_settings_button: boolean;
}
