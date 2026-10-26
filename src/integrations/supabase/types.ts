export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      game_seats: {
        Row: {
          black_token: string | null
          game_id: string
          white_token: string | null
        }
        Insert: {
          black_token?: string | null
          game_id: string
          white_token?: string | null
        }
        Update: {
          black_token?: string | null
          game_id?: string
          white_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_seats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          black_joined: boolean
          black_ms: number
          black_name: string | null
          draw_offer: string | null
          fen: string
          id: string
          increment_ms: number
          initial_ms: number
          last_move: Json | null
          pgn: string
          ply: number
          reason: string | null
          rematch_id: string | null
          result: string | null
          status: string
          takeback_offer: string | null
          turn_started_at: string | null
          updated_at: string
          white_joined: boolean
          white_ms: number
          white_name: string | null
        }
        Insert: {
          black_joined?: boolean
          black_ms?: number
          black_name?: string | null
          draw_offer?: string | null
          fen?: string
          id: string
          increment_ms?: number
          initial_ms?: number
          last_move?: Json | null
          pgn?: string
          ply?: number
          reason?: string | null
          rematch_id?: string | null
          result?: string | null
          status?: string
          takeback_offer?: string | null
          turn_started_at?: string | null
          updated_at?: string
          white_joined?: boolean
          white_ms?: number
          white_name?: string | null
        }
        Update: {
          black_joined?: boolean
          black_ms?: number
          black_name?: string | null
          draw_offer?: string | null
          fen?: string
          id?: string
          increment_ms?: number
          initial_ms?: number
          last_move?: Json | null
          pgn?: string
          ply?: number
          reason?: string | null
          rematch_id?: string | null
          result?: string | null
          status?: string
          takeback_offer?: string | null
          turn_started_at?: string | null
          updated_at?: string
          white_joined?: boolean
          white_ms?: number
          white_name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_takeback: {
        Args: {
          p_fen: string
          p_id: string
          p_last: Json
          p_pgn: string
          p_ply: number
          p_token: string
        }
        Returns: boolean
      }
      check_flag: {
        Args: { g: Database["public"]["Tables"]["games"]["Row"] }
        Returns: boolean
      }
      claim_timeout: { Args: { p_id: string }; Returns: boolean }
      create_game: {
        Args: { p_id: string; p_token: string }
        Returns: undefined
      }
      enter_game: {
        Args: { p_id: string; p_name: string; p_token: string }
        Returns: string
      }
      game_action: {
        Args: { p_action: string; p_id: string; p_token: string }
        Returns: boolean
      }
      join_game: { Args: { p_id: string; p_token: string }; Returns: string }
      make_move: {
        Args: {
          p_fen: string
          p_id: string
          p_last: Json
          p_pgn: string
          p_prev_fen: string
          p_token: string
        }
        Returns: boolean
      }
      new_game: {
        Args: {
          p_color: string
          p_id: string
          p_inc: number
          p_initial: number
          p_name: string
          p_token: string
        }
        Returns: string
      }
      play_move: {
        Args: {
          p_fen: string
          p_id: string
          p_last: Json
          p_pgn: string
          p_prev_fen: string
          p_reason: string
          p_result: string
          p_token: string
        }
        Returns: boolean
      }
      request_rematch: {
        Args: { p_id: string; p_new_id: string; p_token: string }
        Returns: string
      }
      seat_color: { Args: { p_id: string; p_token: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
