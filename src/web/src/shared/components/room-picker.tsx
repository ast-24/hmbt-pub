"use client";

import { knowledge } from "@ast24/hmbt-v5-lib";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  resolveRoom,
  resolveRoomDisplayName,
} from "@/shared/knowledge/safe-lookup";

type RoomPickerProps = {
  value: string;
  onChange: (nextRoomId: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

type RoomOption = {
  id: string;
  displayName: string;
  searchable: string;
};

const ROOM_OPTIONS: RoomOption[] = [];

Object.values(knowledge.room.RoomID).forEach((roomId) => {
  const room = resolveRoom(roomId);
  if (!room) {
    return;
  }

  ROOM_OPTIONS.push({
    id: roomId,
    displayName: room.displayName,
    searchable: `${roomId} ${room.displayName}`.toLowerCase(),
  });
});

function toDisplay(value: string): string {
  if (!value) {
    return "";
  }

  const roomDisplayName = resolveRoomDisplayName(value, null);
  if (roomDisplayName !== null) {
    return roomDisplayName;
  }

  return value;
}

export function RoomPicker({
  value,
  onChange,
  disabled = false,
  placeholder = "教室名で検索",
}: RoomPickerProps) {
  const [query, setQuery] = useState<string>(toDisplay(value));
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery(toDisplay(value));
  }, [value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!root.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [isOpen]);

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return ROOM_OPTIONS.slice(0, 10);
    }

    return ROOM_OPTIONS.filter((option) =>
      option.searchable.includes(normalized),
    ).slice(0, 10);
  }, [query]);

  return (
    <div className="room-picker" ref={rootRef}>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          if (!disabled) {
            setIsOpen(true);
          }
        }}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setIsOpen(true);

          if (!next.trim()) {
            onChange("");
          }
        }}
      />

      {isOpen && !disabled && (
        <div className="room-picker__dropdown">
          {suggestions.length === 0 ? (
            <p className="room-picker__empty">一致する教室がありません</p>
          ) : (
            <ul>
              {suggestions.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="room-picker__option"
                    onClick={() => {
                      onChange(option.id);
                      setQuery(option.displayName);
                      setIsOpen(false);
                    }}
                  >
                    <span>{option.displayName}</span>
                    <small>{option.id}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
