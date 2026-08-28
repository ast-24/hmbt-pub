import { Option } from "../cmn";

export interface DailyCafeMenu {
  menus_as_str: Option<string[]>;
  menus_as_img_url: Option<string>;
  menus_as_img_preview_url: Option<string>;
}
